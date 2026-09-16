// Apply the saved theme before the first paint.
try {
  var t = localStorage.getItem('rp-theme');
  if (t === 'fabled') t = 'default'; // what this theme used to be called
  if (t !== 'light' && t !== 'dark' && t !== 'default') t = 'default';
  var c = document.documentElement.classList;
  c.toggle('dark', t !== 'light');
  c.toggle('theme-default', t === 'default');
  c.toggle('theme-dark', t === 'dark');
  c.toggle('theme-light', t === 'light');
  document.documentElement.style.colorScheme = t === 'light' ? 'light' : 'dark';
} catch (e) {}
