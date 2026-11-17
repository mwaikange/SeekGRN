export const personal = [
  ['surname','Surname'], ['maiden','Maiden name'], ['names','First names'], ['identity','Namibian identity number'],
  ['birth','Date of birth','date'], ['passport','Passport number'], ['citizenship','Citizenship'], ['permit','Work permit number'],
  ['gender','Gender',['Male','Female']], ['marital','Marital status',['Married','Single','Other']],
  ['postal','Postal address'], ['residential','Residential address'], ['home','Home telephone','tel'], ['mobile','Mobile number','tel'],
  ['work','Work telephone','tel'], ['fax','Fax'], ['email','Email','email'], ['faxmail','Fax2mail'], ['alternate','Alternative contact name'],
  ['alternatePhone','Alternative contact telephone','tel'], ['available','When can you assume duty?']
];
export const employment = [
  ['ministry','Office, ministry, agency or regional council'], ['station','Duty station'], ['designation','Job designation'],
  ['grade','Grade'], ['appointment','Appointment date','date'], ['scale','Salary scale'], ['notch','Salary notch'],
  ['probation','Probation confirmed?',true]
];
export const disclosures = [
  ['convicted','Have you ever been convicted of a criminal offence?'], ['pending','Is a criminal or other case pending against you?'],
  ['dismissed','Have you ever been dismissed from employment?'], ['boarded','Have you ever been boarded on medical grounds?'],
  ['obligations','Do you have contractual obligations such as a bursary?']
];
export const health = [
  ['skin','Skin disease'], ['joints','Skeletal or joint condition'], ['senses','Condition affecting the eyes, ears, nose or teeth'],
  ['heart','Heart or circulatory condition'], ['breathing','Chest or respiratory condition'], ['digestion','Digestive condition'],
  ['urinary','Urinary, genital or reproductive condition'], ['nerves','Nervous system condition or mental illness'], ['otherIllness','Other illness'],
  ['impairment','Sensory impairment'], ['disability','Disability'], ['surgery','Previous surgery or operations']
];
export const levels = ['Good','Fair','Poor'];
export const languages = [['language','Language'], ['speak','Speak',levels], ['read','Read',levels], ['write','Write',levels]];
export const qualifications = [['institution','Institution'], ['certificate','Qualification'], ['subjects','All subjects (comma-separated)'], ['majors','Major subjects (comma-separated)'], ['obtained','Month and year obtained']];
export const experience = [['employer','Employer'], ['post','Post held'], ['from','From','date'], ['to','To','date'], ['reason','Reason for change']];
export const otherQualifications = [['study','Field of further study'], ['apprenticeship','Years of apprenticeship','number'], ['agreement','Agreement number'], ['training','Apprenticeship institution'], ['statutory','Statutory registration date and particulars']];
export const sections = [['personal','Personal details'],['employment','Current employment'],['qualifications','Qualifications and languages'],['experience','Work experience'],['health','Health questionnaire'],['review','Declarations and confirmation']];
export const blankProfile = () => ({employmentType:'', school:{}, tertiary:[], experience:[], languages:[{language:'English'}], confirmed:false});
function missingFields(profile, keys) {
  return keys.some(key => !String(profile[key] ?? '').trim());
}
export function problems(p) {
  const warnings = [];
  if (missingFields(p,['surname','names','birth','citizenship','gender','marital','postal','residential','mobile','email','alternate','alternatePhone','available']) || !(p.identity || p.passport)) warnings.push('Complete your identity, contact and availability details.');
  if (!p.employmentType || (p.employmentType === 'Yes' && missingFields(p,employment.map(([key])=>key)))) warnings.push('Complete your current Public Service employment details.');
  if (p.languages.some(row => missingFields(row,['language','speak','read','write']))) warnings.push('Select speaking, reading and writing levels for each language.');
  const credentials = [p.school,...p.tertiary].filter(row => Object.values(row).some(Boolean));
  if (credentials.some(row => missingFields(row,['institution','certificate','subjects','obtained']) || /see (?:the )?(?:attach|cv)/i.test(row.subjects))) warnings.push('Enter the institution, qualification, actual subjects and award date for each qualification.');
  if (p.experience.some(row => missingFields(row,['employer','post','from','reason']))) warnings.push('Complete each employment history entry or remove its empty row.');
  if (!(Number(p.height)>0) || !(Number(p.mass)>0) || [...health,...disclosures].some(([key]) => !p[key] || (p[key]==='Yes' && !String(p[key+'Details'] ?? '').trim()))) warnings.push('Answer the health and declaration questions and explain every Yes answer.');
  return warnings;
}
