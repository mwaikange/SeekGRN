import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pageLines, parseCircular, vacancyUnitLines, withBundledVacancyUnits } from '../src/circular-parser.js';
import { cutoff, expired, retired } from '../src/circular.js';
import { readProfileSlots } from '../src/form-layout.js';
import { prepareForms } from '../src/pdf.js';

async function extractPages(pdfBytes) {
  const pdf = await getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    isEvalSupported: false
  }).promise;
  try {
    return await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      return { items: (await page.getTextContent()).items, fields: await page.getAnnotations() };
    }));
  } finally {
    await pdf.destroy();
  }
}

test('reads the supplied 108-page circular and its individual duty stations', async () => {
  const pages = await extractPages(await readFile('public/circular.pdf'));
  assert.equal(pages.length, 108);
  const result = parseCircular(pages.map(page => pageLines(page.items)));
  assert.equal(result.title, 'PSM Circular No. I of 2026');
  assert.equal(result.closes, '2026-12-07');
  assert.equal(result.jobs.length, 206);
  assert.equal(new Set(result.jobs.map(job => job.id)).size, 206);
  assert.ok(result.jobs.every(job => job.title && job.org && job.station && job.page >= 5));
  assert.equal(result.jobs[0].station, 'Windhoek');
  assert.ok(result.jobs.some(job => job.station.includes('Ohakafiya Combined School')));
  const index=JSON.parse(await readFile('src/bundled-circular-headings.json','utf8'));
  const legacy=result.jobs.map(({department,directorate,division,subdivision,section,...job})=>({
    ...job,station:job.station.replace(/\s+:/g,':')
  }));
  const circular={...result,pdf:'/circular.pdf',jobs:legacy};
  const indexedJobs=new Map(withBundledVacancyUnits(circular,index).jobs.map(job=>[job.id,job]));
  for(const [id,{title,org,station,...headings}] of Object.entries(index.jobs)){
    for(const [key,value] of Object.entries(headings))assert.equal(indexedJobs.get(id)?.[key],value,id);
  }
  const listing=legacy.find(job=>job.id==='psm-2026-12-07-1');
  const spaced={...listing,title:'Di rector',org:'Office of the Prime  Minister',station:'Wind hoek'};
  const [matched]=withBundledVacancyUnits({...circular,jobs:[spaced]},index).jobs;
  assert.equal(matched.directorate,'ORGANIZATIONAL DEVELOPMENT AND GRADING');
  assert.equal(matched.station,'Wind hoek');
  const edited={...listing,station:'Another location'};
  assert.deepEqual(withBundledVacancyUnits({...circular,jobs:[edited]},index).jobs,[edited]);
  const uploaded={...circular,pdf:new Blob()};
  assert.equal(withBundledVacancyUnits(uploaded,index),uploaded);
});

test('keeps division and subdivision together and clears the subdivision when the division changes', () => {
  const {jobs} = parseCircular([
    'MINISTRY OF HEALTH AND SOCIAL SERVICES\nDivision: General Support Services\nSubdivision: Resources Management\nPost Designation: Chief Administrative Officer Grade 8\nDuty Station: Karasburg\nSalary: Example\nDivision: Human Resources\nPost Designation: Administrative Officer Grade 10\nDuty Station: Windhoek\nSalary: Example\nDivision: Finance / Sub-Division: Payroll\nPost Designation: Payroll Officer Grade 8\nDuty Station: Outjo'
  ]);
  assert.equal(jobs[0].division,'General Support Services');
  assert.equal(jobs[0].subdivision,'Resources Management');
  assert.equal(jobs[1].division,'Human Resources');
  assert.equal(jobs[1].subdivision,'');
  assert.equal(jobs[2].division,'Finance');
  assert.equal(jobs[2].subdivision,'Payroll');
});

test('stores the available workplace headings and formats legacy vacancy records', () => {
  const {jobs}=parseCircular([[
    'MINISTRY OF HEALTH AND SOCIAL SERVICES',
    'Department: Operations',
    'Directorate: General Services',
    'Division: Finance / Sub-Division: Payroll',
    'Section: Salaries',
    'Post Designation: Administrative Officer Grade 8',
    'Duty Station: Windhoek',
    'Salary: Example',
    'Directorate: Field Services',
    'Post Designation: Regional Officer Grade 7',
    'Duty Station: Outjo'
  ].join('\n')]);
  assert.deepEqual(vacancyUnitLines(jobs[0]),[
    'Department: Operations','Directorate: General Services','Division: Finance','Subdivision: Payroll','Section: Salaries'
  ]);
  assert.deepEqual(vacancyUnitLines(jobs[1]),['Department: Operations','Directorate: Field Services']);
  assert.deepEqual(vacancyUnitLines({unit:'Water Supply and Sanitation'}),['Unit: Water Supply and Sanitation']);
  assert.deepEqual(vacancyUnitLines({details:'Duty Station: Outjo\nSection: Client Services'}),['Section: Client Services']);
});

test('closes at midnight Namibia time and retires 48 hours later', () => {
  const circular = { closes: '2026-12-07' };
  const stop = cutoff(circular);
  assert.equal(new Date(stop).toISOString(), '2026-12-06T22:00:00.000Z');
  const originalNow = Date.now;
  try {
    Date.now = () => stop - 1;
    assert.equal(expired(circular), false);
    Date.now = () => stop;
    assert.equal(expired(circular), true);
    assert.equal(retired(circular), false);
    Date.now = () => stop + 48 * 60 * 60 * 1000;
    assert.equal(retired(circular), true);
  } finally {
    Date.now = originalNow;
  }
});

test('fills the official PDFs, retains both pages, and reads applicant fields back', async t => {
  t.mock.method(globalThis, 'fetch', async path => {
    assert.ok(['/application.pdf','/health.pdf'].includes(path));
    return new Response(await readFile('public' + path));
  });
  const profile = {
    surname: 'EXAMPLE', names: 'TEST APPLICANT', identity: '90010101001', birth: '1990-01-01',
    citizenship: 'Namibian', gender: 'Female', marital: 'Single', mobile: '+264811234567',
    email: 'applicant@example.invalid', postal: 'PO Box 10\nExample Town, Namibia', residential: '44 Example Street\nExample Town, Namibia',
    available: 'Immediately', employmentType: 'No', height: '172', mass: '63',
    languages: [{ language: 'English', speak: 'Good', read: 'Good', write: 'Good' }],
    school: { institution: 'Example School', certificate: 'NSSCO', subjects: 'English, Afrikaans, Mathematics, Economics, Principles of Accounting, Business Studies, Physical Science, Geography, Computer Studies, History, Development Studies', majors: 'Principles of Accounting', obtained: 'Dec 2008' },
    tertiary: [
      {institution:'Example Polytechnic',certificate:'Diploma in Business Administration and Management',subjects:'Business Procedures, Economics Control, Social Sciences, Business Communication', obtained:'April 2012'},
      {institution:'Example Polytechnic',certificate:'Certificate in Applied Business Processes',subjects:'Applied Business Economics, Practical Costing, Transport and Logistics',obtained:'April 2010'}
    ],
    experience: [{employer:'Example Office',post:'Officer',from:'2012-04-01',current:true,to:'2014-06-30'}],
    convicted: 'Yes', convictedDetails: 'Synthetic example for PDF testing.'
  };
  const job = { id: 'test', title: 'Education Officer', org: 'Oshikoto Regional Council', grade: '8', reference: '1234',
    station: 'Rev Selma Kawiiwa Primary School: Junior Primary Phase (Oshikwanyama Medium of Instruction), Eenhana Circuit',
    division: 'General Support Services', subdivision: 'Resources Management' };
  const circular = { title: 'PSM Circular No. I of 2026', advertised: '2026-11-06' };
  const generated = await prepareForms(profile, job, circular);
  assert.equal(generated.files.length, 3);
  for (const [index, type] of ['application', 'health'].entries()) {
    const bytes = await generated.files[index].blob.arrayBuffer();
    const template = await readFile('public/' + type + '.pdf');
    const doc = await PDFDocument.load(bytes);
    const original = await PDFDocument.load(template);
    assert.deepEqual(doc.getPages().map(page => page.getSize()), original.getPages().map(page => page.getSize()));
    const pages = await extractPages(bytes);
    const combined = pages.map(page => pageLines(page.items)).join('\n');
    assert.match(combined, /TEST APPLICANT/);
    if (type === 'application') assert.match(combined, /Ref\. 1234/);
    else assert.match(combined, /172/);
    const blank = await extractPages(template);
    const filled = pages.map((page, i) => ({
      ...page,
      items: page.items.filter(item => !blank[i].items.some(reference =>
        reference.str === item.str && Math.abs(reference.transform[4] - item.transform[4]) < 1 &&
        Math.abs(reference.transform[5] - item.transform[5]) < 1))
    }));
    const values = readProfileSlots(filled, type);
    assert.equal(values.surname, 'EXAMPLE');
    assert.equal(values.identity, '90010101001');
    if(type==='application'){
      assert.match(combined,/Division: General Support Services \/ Subdivision: Resources Management/);
      assert.equal(filled[0].items.filter(i=>i.str==='N/A'&&i.transform[5]>=95&&i.transform[5]<=128).length,7);
      const idDigits=filled[0].items.filter(i=>/^\d$/.test(i.str)&&i.transform[5]===404&&i.transform[4]<258);
      assert.equal(idDigits.length,profile.identity.length);
      const centers=[49.02,64.99,80.97,96.93,112.89,128.85,144.75,160.71,176.61,192.58,208.55];
      assert.ok(idDigits.every((i,index)=>Math.abs(i.transform[4]+i.width/2-centers[index])<.05));
      assert.equal(values.postal,profile.postal);
      assert.equal(values.residential,profile.residential);
      assert.equal(values.school.certificate,profile.school.certificate);
      assert.equal(values.school.subjects,profile.school.subjects);
      assert.deepEqual(values.tertiary,profile.tertiary);
      assert.equal(values.experience[0].current,true);
      assert.equal(values.experience[0].to,'');
      assert.match(combined,/Present/);
    }
  }
  const supplement = await extractPages(await generated.files[2].blob.arrayBuffer());
  assert.match(pageLines(supplement[0].items), /Synthetic example for PDF testing/);
  const longSubjects = Array.from({length:30},(_,i)=>'Course '+(i+1)+' International Logistics and Procurement').join(', ') + ', Final Capstone Project';
  const overflow = await prepareForms({...profile,school:{...profile.school,subjects:longSubjects}},job,circular);
  const overflowForm=await extractPages(await overflow.files[0].blob.arrayBuffer());
  const overflowSheet=await extractPages(await overflow.files[2].blob.arrayBuffer());
  assert.match(pageLines(overflowForm[1].items),/See addendum/);
  assert.match(pageLines(overflowSheet[0].items).replace(/\s+/g,' '),/Final Capstone Project/);
  const legacy=await prepareForms(profile,{...job,division:undefined,subdivision:undefined,unit:'Water Supply and Sanitation'},{
    ...circular,pdf:'/circular.pdf'
  });
  const legacyForm=await extractPages(await legacy.files[0].blob.arrayBuffer());
  assert.match(pageLines(legacyForm[0].items),/Unit: Water Supply and Sanitation/);
});
