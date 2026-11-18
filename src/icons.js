const paths = {
  subscription:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18M7 15h3m4 0h3M8 3v4m8-4v4"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  google:'<path stroke="#4285f4" stroke-width="3" d="M21 12h-9m9 0c0 6-6 10-11 8"/><path stroke="#34a853" stroke-width="3" d="M10 20c-4-1-6-4-6-8"/><path stroke="#fbbc05" stroke-width="3" d="M4 12c0-3 1-5 3-7"/><path stroke="#ea4335" stroke-width="3" d="M7 5c4-3 9-3 12 1"/>',
  apple:'<path fill="currentColor" stroke="none" d="M16.5 2c.1 1.5-.5 2.7-1.3 3.6-.9.9-2.1 1.6-3.4 1.5-.2-1.4.5-2.7 1.3-3.5.9-1 2.3-1.7 3.4-1.6ZM20 17.1c-.5 1.2-.8 1.7-1.5 2.8-.9 1.3-2.1 2.9-3.6 2.9-1.3 0-1.7-.8-3.5-.8-1.8 0-2.3.8-3.6.8-1.5 0-2.6-1.4-3.5-2.7C1.8 16.5 1 11.7 2.6 9.2c1.1-1.8 2.8-2.8 4.5-2.8 1.4 0 2.6.9 3.5.9.9 0 2.4-1.1 4-1 1.4.1 2.7.8 3.6 1.9-3.2 1.8-2.7 6.2.8 7.5l1 .4Z"/>',
  briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13h18m-11-1v3h4v-3"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
  file:'<path d="M14 2H5v20h14V7zM14 2v6h5M8 13h8m-8 4h8"/>',
  search:'<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  building:'<path d="M3 21h18M6 21V8l6-5 6 5v13M9 10h1m4 0h1m-6 4h1m4 0h1m-4 7v-4h2v4"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  external:'<path d="M13 4h7v7m0-7-9 9m7 0v7H4V6h7"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  shield:'<path d="m12 3 8 3v6c0 5-5 8-8 10-3-2-8-5-8-10V6z"/><path d="m8 12 3 3 5-5"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  share:'<path d="M12 16V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
export const icon = (name, size=18) => '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg>';
