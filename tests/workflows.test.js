import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pageLines, parseCircular } from '../src/circular-parser.js';
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
  t.mock.method(globalThis, 'fetch', async path => new Response(await readFile('public' + path)));
  const profile = {
    surname: 'EXAMPLE', names: 'TEST APPLICANT', identity: '90010101001', birth: '1990-01-01',
    citizenship: 'Namibian', gender: 'Female', marital: 'Single', mobile: '+264811234567',
    email: 'applicant@example.invalid', postal: 'PO Box 10', residential: '44 Example Street',
    available: 'Immediately', employmentType: 'No', height: '172', mass: '63',
    languages: [{ language: 'English', speak: 'Good', read: 'Good', write: 'Good' }],
    school: { institution: 'Example School', certificate: 'NSSCO', subjects: 'English, Mathematics', majors: 'Mathematics', obtained: 'Dec 2008' },
    tertiary: [], experience: [], convicted: 'Yes', convictedDetails: 'Synthetic example for PDF testing.'
  };
  const job = { id: 'test', title: 'Education Officer', org: 'Oshikoto Regional Council', grade: '8', reference: '1234',
    station: 'Rev Selma Kawiiwa Primary School: Junior Primary Phase (Oshikwanyama Medium of Instruction), Eenhana Circuit' };
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
    const values = readProfileSlots(pages.map((page, i) => ({
      ...page,
      items: page.items.filter(item => !blank[i].items.some(reference =>
        reference.str === item.str && Math.abs(reference.transform[4] - item.transform[4]) < 1 &&
        Math.abs(reference.transform[5] - item.transform[5]) < 1))
    })), type);
    assert.equal(values.surname, 'EXAMPLE');
    assert.equal(values.identity, '90010101001');
  }
  const supplement = await extractPages(await generated.files[2].blob.arrayBuffer());
  assert.match(pageLines(supplement[0].items), /Synthetic example for PDF testing/);
});
