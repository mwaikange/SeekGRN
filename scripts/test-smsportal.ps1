param(
 [ValidatePattern('^\+2648\d{8}$')][string]$Phone = '+264818083704',
 [switch]$Live
)

$smsClient = (Read-Host 'SMSPortal REST Client ID').Trim()
$smsSecureSecret = Read-Host 'Matching SMSPortal API Secret' -AsSecureString
$smsSecret = [System.Net.NetworkCredential]::new('', $smsSecureSecret).Password.Trim()
if (-not $smsClient -or -not $smsSecret) { throw 'Client ID and API Secret are required.' }
$smsAuth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($smsClient + ':' + $smsSecret))
$smsBody = @{
 sendOptions = @{ testMode = (-not $Live.IsPresent) }
 messages = @(@{
  destination = $Phone
  content = 'SeekGRNJobs SMS delivery test. This is not a sign-in code.'
 })
} | ConvertTo-Json -Depth 5

try {
 Write-Output $(if ($Live) { 'LIVE: requesting one labelled SMS delivery.' } else { 'TEST MODE: no SMS will be delivered and no credits will be deducted.' })
 try {
  $smsReply = Invoke-WebRequest -UseBasicParsing -Uri 'https://rest.smsportal.com/v1/bulkmessages' -Method Post -Headers @{ Authorization = 'Basic ' + $smsAuth; Accept = 'application/json' } -ContentType 'application/json' -Body $smsBody -TimeoutSec 15 -ErrorAction Stop
  $smsStatus = [int]$smsReply.StatusCode
  $smsResponseText = [string]$smsReply.Content
 } catch {
  $smsErrorRecord = $_
  if (-not $smsErrorRecord.Exception.Response) { throw 'No HTTP response was received from SMSPortal. Check the connection and endpoint.' }
  $smsStatus = [int]$smsErrorRecord.Exception.Response.StatusCode
  if ($smsErrorRecord.Exception.Response.Content) {
   $smsResponseText = $smsErrorRecord.Exception.Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  } else {
   $smsReader = [IO.StreamReader]::new($smsErrorRecord.Exception.Response.GetResponseStream())
   try { $smsResponseText = $smsReader.ReadToEnd() } finally { $smsReader.Dispose() }
  }
 }
 Write-Output ('SMSPortal HTTP status: ' + $smsStatus)
 $smsKnownCodes = 'InvalidParameter\.Format|InvalidParameter\.Type|RequiredParameter\.Missing|AuthenticationToken\.Invalid|AuthenticationToken\.Expired|InvalidCredentials|AuthenticationHeader\.Missing|AuthenticationHeader\.Invalid|InsufficientCredits|IncorrectScheduledDate|DestinationAddress\.NoNetworkFound|DestinationAddress\.Invalid|DestinationAddress\.Optout|DuplicateMessage|EmptySend\.NoValidMessages|InternalServerError'
 $smsCodes = @([regex]::Matches($smsResponseText, $smsKnownCodes) | ForEach-Object { $_.Value } | Select-Object -Unique)
 if ($smsCodes.Count) { Write-Output ('Provider codes: ' + ($smsCodes -join ', ')) }
 else { Write-Output 'No documented error code was found in the response. HTTP success alone does not prove handset delivery.' }
} finally {
 $smsSecret = $null
 $smsAuth = $null
 $smsResponseText = $null
 $smsSecureSecret.Dispose()
}
