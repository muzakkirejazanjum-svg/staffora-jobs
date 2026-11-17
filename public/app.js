// Staffora Jobs frontend — talks only to /api/* on the same origin.
let me = null;
let jobsCache = [];
let savedIds = new Set();
let googleClientId = null;

async function api(path, opts) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...(opts || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request fail ho gaya');
  return data;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function salaryLabel(j) {
  if (j.salaryMin == null && j.salaryMax == null) return 'Salary: poster me dekho';
  if (j.salaryMin === j.salaryMax) return `${j.salaryCurrency} ${j.salaryMin} / month`;
  return `${j.salaryCurrency} ${j.salaryMin || ''}–${j.salaryMax || ''} / month`;
}

async function refreshMe() {
  try {
    const d = await api('/api/auth/me');
    me = d.user;
  } catch { me = null; }
  document.getElementById('loginBtn').style.display = me ? 'none' : '';
  document.getElementById('logoutBtn').style.display = me ? '' : 'none';
  document.getElementById('navSaved').style.display = me ? '' : 'none';
  document.getElementById('navMyApps').style.display = me ? '' : 'none';
  document.getElementById('navProfile').style.display = me ? '' : 'none';
  document.getElementById('navAdmin').style.display = me && me.role === 'admin' ? '' : 'none';
  const chip = document.getElementById('userChip');
  if (me) { chip.style.display = ''; chip.textContent = me.name + (me.role === 'admin' ? ' (Admin)' : ''); }
  else chip.style.display = 'none';
  if (me) fillProfile();
}

async function loadJobs() {
  const q = document.getElementById('q').value;
  const country = document.getElementById('country').value;
  const trade = document.getElementById('trade').value;
  const sort = document.getElementById('sort').value;
  const params = new URLSearchParams({ query: q, country, trade, sort });
  const d = await api('/api/jobs?' + params);
  jobsCache = d.jobs;
  const sel = document.getElementById('country');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Countries</option>' + d.countries.map((c) => `<option>${esc(c)}</option>`).join('');
  sel.value = cur;
  document.getElementById('jobCount').textContent = d.jobs.length + ' jobs mile';
  document.getElementById('jobList').innerHTML = d.jobs.map((j) => `
    <div class="jobcard" onclick="openJob(${j.id})">
      <h3>${esc(j.title)}</h3>
      <div class="meta">${esc(j.company)} • ${esc(j.country)}${j.city ? ' • ' + esc(j.city) : ''} • ${esc(j.trade)}</div>
      <div class="salary">${esc(salaryLabel(j))}</div>
      <div class="meta">${j.vacancies ? esc(j.vacancies) + '+ vacancies • ' : ''}${esc(j.benefits || '')}</div>
    </div>`).join('') || '<p>Koi job nahi mili — search badal kar dekho.</p>';
}

function openJob(id) {
  const j = jobsCache.find((x) => x.id === id);
  if (!j) return;
  document.getElementById('jobDetail').innerHTML = `
    <h2>${esc(j.title)}</h2>
    <p><strong>${esc(j.company)}</strong> • ${esc(j.country)}${j.city ? ' • ' + esc(j.city) : ''}</p>
    <p class="salary">${esc(salaryLabel(j))}</p>
    ${j.vacancies ? `<p>Vacancies: ${esc(j.vacancies)}+</p>` : ''}
    ${j.benefits ? `<p><strong>Benefits:</strong> ${esc(j.benefits)}</p>` : ''}
    ${j.dutyInfo ? `<p><strong>Duty:</strong> ${esc(j.dutyInfo)}</p>` : ''}
    ${j.requirements ? `<p><strong>Requirements:</strong> ${esc(j.requirements)}</p>` : ''}
    <p style="white-space: pre-wrap">${esc(j.description || '')}</p>
    <div class="row">
      <button class="btn primary" onclick="applyJob(${j.id})">Apply karo</button>
      <button class="btn" onclick="toggleSave(${j.id}, this)">Save karo</button>
    </div>
    <p id="applyMsg"></p>`;
  document.getElementById('jobModal').style.display = 'flex';
}
function closeJob() { document.getElementById('jobModal').style.display = 'none'; }

async function toggleSave(id, btn) {
  if (!me) { openAuth(); return; }
  const d = await api(`/api/jobs/${id}/toggle-save`, { method: 'POST', body: '{}' });
  btn.textContent = d.saved ? 'Saved ✓' : 'Save karo';
}
async function applyJob(id) {
  if (!me) { closeJob(); openAuth(); return; }
  try {
    const d = await api(`/api/jobs/${id}/apply`, { method: 'POST', body: '{}' });
    document.getElementById('applyMsg').innerHTML =
      `Application save ho gayi ✓ <br><a href="${d.whatsappUrl}" target="_blank" rel="noopener"><button class="btn primary">WhatsApp par Apply karo (95464 50997)</button></a>`;
  } catch (e) {
    document.getElementById('applyMsg').textContent = e.message;
    if (e.message.includes('mobile')) showView('profile');
  }
}

function showView(v) {
  for (const x of ['jobs', 'saved', 'myapps', 'profile', 'admin']) {
    document.getElementById('view-' + x).style.display = x === v ? '' : 'none';
  }
  if (v === 'saved') loadSaved();
  if (v === 'myapps') loadMyApps();
  if (v === 'admin') loadAdmin();
}
async function loadSaved() {
  try {
    const d = await api('/api/saved');
    document.getElementById('savedList').innerHTML = d.jobs.map((j) => `
      <div class="jobcard" onclick="openJob(${j.id})"><h3>${esc(j.title)}</h3>
      <div class="meta">${esc(j.company)} • ${esc(j.country)}</div>
      <div class="salary">${esc(salaryLabel(j))}</div></div>`).join('') || '<p>Koi saved job nahi hai.</p>';
  } catch (e) { document.getElementById('savedList').textContent = e.message; }
}
async function loadMyApps() {
  try {
    const d = await api('/api/applications/mine');
    document.getElementById('myAppsList').innerHTML = d.applications.length
      ? '<table><tr><th>Job</th><th>Company</th><th>Status</th></tr>' + d.applications.map((a) =>
        `<tr><td>${esc(a.title)}</td><td>${esc(a.company)}</td><td>${esc(a.status)}</td></tr>`).join('') + '</table>'
      : '<p>Abhi tak koi application nahi hai.</p>';
  } catch (e) { document.getElementById('myAppsList').textContent = e.message; }
}
function fillProfile() {
  if (!me) return;
  document.getElementById('pName').value = me.name || '';
  document.getElementById('pMobile').value = me.mobile || '';
  document.getElementById('pTrade').value = me.trade || '';
  document.getElementById('pExp').value = me.experienceYears == null ? '' : me.experienceYears;
  document.getElementById('pGulf').checked = !!me.gulfExperience;
  document.getElementById('pPassport').value = me.passportStatus || '';
}
async function saveProfile() {
  try {
    const d = await api('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('pName').value,
        mobile: document.getElementById('pMobile').value,
        trade: document.getElementById('pTrade').value,
        experienceYears: document.getElementById('pExp').value,
        gulfExperience: document.getElementById('pGulf').checked,
        passportStatus: document.getElementById('pPassport').value,
      }),
    });
    me = d.user;
    document.getElementById('profileMsg').textContent = 'Profile save ho gaya ✓';
  } catch (e) { document.getElementById('profileMsg').textContent = e.message; }
}

// ---------- auth ----------
function openAuth() { document.getElementById('authModal').style.display = 'flex'; initGoogle(); }
function closeAuth() { document.getElementById('authModal').style.display = 'none'; }
async function doLogin() {
  try {
    const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ mobile: document.getElementById('authMobile').value, password: document.getElementById('authPass').value }) });
    me = d.user; closeAuth(); refreshMe(); loadJobs();
  } catch (e) { document.getElementById('authMsg').textContent = e.message; }
}
async function doSignup() {
  try {
    const isAdmin = document.getElementById('authAdmin').checked;
    const d = await api('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('authName').value,
        mobile: document.getElementById('authMobile').value,
        password: document.getElementById('authPass').value,
        role: isAdmin ? 'admin' : 'candidate',
        staffCode: document.getElementById('authStaff').value,
      }),
    });
    me = d.user; closeAuth(); refreshMe(); loadJobs();
  } catch (e) { document.getElementById('authMsg').textContent = e.message; }
}
async function logout() { await api('/api/auth/logout', { method: 'POST', body: '{}' }); me = null; refreshMe(); loadJobs(); }

async function initGoogle() {
  try {
    const d = await api('/api/config');
    googleClientId = d.googleClientId;
    const note = document.getElementById('googleNote');
    if (!googleClientId) { note.textContent = 'Google se login — setup baaki hai (admin Client ID add kare)'; return; }
    note.textContent = '';
    if (window.google && google.accounts) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (resp) => {
          try {
            const r = await api('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken: resp.credential }) });
            me = r.user; closeAuth(); refreshMe(); loadJobs();
            if (r.needsMobile) { alert('Google login ho gaya — ab Profile me apna mobile number add karo, tabhi apply kar paoge.'); showView('profile'); }
          } catch (e) { document.getElementById('authMsg').textContent = e.message; }
        },
      });
      google.accounts.id.renderButton(document.getElementById('googleBtn'), { theme: 'outline', size: 'large', width: 320 });
    }
  } catch { /* Google button optional — mobile login hamesha kaam karta hai */ }
}

// ---------- admin ----------
async function loadAdmin() {
  document.getElementById('gOrigin').textContent = location.origin;
  try {
    const d = await api('/api/config');
    document.getElementById('gCurrent').textContent = d.googleClientId || 'not set';
    document.getElementById('gClientId').value = d.googleClientId || '';
  } catch { /* ignore */ }
  try {
    const d = await api('/api/admin/applications');
    document.getElementById('adminApps').innerHTML = d.applications.length
      ? '<table><tr><th>Candidate</th><th>Mobile</th><th>Job</th><th>Status</th></tr>' + d.applications.map((a) =>
        `<tr><td>${esc(a.candidate_name)}</td><td>${esc(a.candidate_mobile || '')}</td><td>${esc(a.title)}</td>
        <td><select onchange="setAppStatus(${a.id}, this.value)">
          ${['applied', 'shortlisted', 'selected', 'rejected'].map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select></td></tr>`).join('') + '</table>'
      : '<p>Abhi tak koi application nahi hai.</p>';
  } catch (e) { document.getElementById('adminApps').textContent = e.message; }
  try {
    const d = await api('/api/jobs?sort=newest');
    document.getElementById('adminJobs').innerHTML = d.jobs.map((j) => `
      <div class="jobcard"><h3>${esc(j.title)}</h3><div class="meta">${esc(j.company)} • ${esc(j.country)} • ${esc(j.status)}</div>
      <button class="btn small" onclick="toggleJobStatus(${j.id}, '${j.status}')">${j.status === 'open' ? 'Close karo' : 'Reopen karo'}</button></div>`).join('');
  } catch (e) { document.getElementById('adminJobs').textContent = e.message; }
}
async function setAppStatus(id, status) {
  await api(`/api/admin/applications/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
}
async function toggleJobStatus(id, status) {
  await api(`/api/admin/jobs/${id}`, { method: 'PUT', body: JSON.stringify({ status: status === 'open' ? 'closed' : 'open' }) });
  loadAdmin();
}
async function postJob() {
  try {
    const d = await api('/api/admin/jobs', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('aTitle').value,
        company: document.getElementById('aCompany').value,
        country: document.getElementById('aCountry').value,
        city: document.getElementById('aCity').value,
        trade: document.getElementById('aTrade').value,
        salaryMin: document.getElementById('aSalMin').value,
        salaryMax: document.getElementById('aSalMax').value,
        salaryCurrency: document.getElementById('aCurr').value,
        vacancies: document.getElementById('aVac').value,
        benefits: document.getElementById('aBen').value,
        description: document.getElementById('aDesc').value,
        requirements: document.getElementById('aReq').value,
      }),
    });
    document.getElementById('adminMsg').textContent = 'Job post ho gayi ✓ (ID ' + d.job.id + ')';
    loadJobs();
  } catch (e) { document.getElementById('adminMsg').textContent = e.message; }
}
async function saveGoogleClientId() {
  try {
    await api('/api/admin/google-client-id', { method: 'POST', body: JSON.stringify({ clientId: document.getElementById('gClientId').value }) });
    alert('Google Client ID save ho gaya. Naye host ka origin Google Cloud me add karna mat bhoolo.');
    loadAdmin();
  } catch (e) { alert(e.message); }
}

refreshMe();
loadJobs();
