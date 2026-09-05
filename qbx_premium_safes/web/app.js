
const resourceName = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'qbx_premium_safes';
const app = document.getElementById('app');
let state = null;
let selectedSearchResult = null;
let searchTimer = null;
let alarmTimer = null;
let alarmSoundEnabled = localStorage.getItem('alarmSoundEnabled') !== 'false';
let trackerState = { members: [], progress: {}, isLeader: false };
app.classList.add('hidden');
const post = async (event, data = {}) => {
  const response = await fetch(`https://${resourceName}/${event}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data),
  });
  try { return await response.json(); } catch (_) { return null; }
};
const alarmOverlay = document.getElementById('alarmOverlay');
const alarmOverlayTitle = document.getElementById('alarmOverlayTitle');
const alarmOverlaySubtitle = document.getElementById('alarmOverlaySubtitle');

function showAlarmOverlay(payload = {}) {
  if (!alarmOverlay) return;
  if (alarmTimer) {
    clearTimeout(alarmTimer);
    alarmTimer = null;
  }

  const safeName = payload.safeName || '';
  const titleText = safeName ? `${payload.title || 'SAFE UNDER ATTACK'} - ${safeName}` : (payload.title || 'SAFE UNDER ATTACK');
  alarmOverlayTitle.textContent = titleText;
  alarmOverlaySubtitle.textContent = payload.subtitle || 'Break-in attempt detected';
  alarmOverlay.classList.remove('hidden');
  alarmOverlay.classList.remove('alarm-overlay--active');
  void alarmOverlay.offsetWidth;
  alarmOverlay.classList.add('alarm-overlay--active');

  // Play alarm sound only if enabled
  const alarmSound = document.getElementById('alarmSound');
  if (alarmSound && payload.soundFile && alarmSoundEnabled) {
    alarmSound.src = `sounds/${payload.soundFile}.ogg`;
    alarmSound.currentTime = 0;
    alarmSound.play().catch(() => {});
  }

  const duration = Number(payload.duration || 9000);
  alarmTimer = setTimeout(() => {
    alarmOverlay.classList.add('hidden');
    alarmOverlay.classList.remove('alarm-overlay--active');
    // Stop the sound
    if (alarmSound) {
      alarmSound.pause();
      alarmSound.currentTime = 0;
    }
    alarmTimer = null;
  }, duration);
}

 const els = {
  title: document.getElementById('safeTitle'), ownerName: document.getElementById('ownerName'), groupAssignment: document.getElementById('groupAssignment'),
  statusText: document.getElementById('statusText'), totalProgressText: document.getElementById('totalProgressText'), totalProgressBar: document.getElementById('totalProgressBar'),
  topContributor: document.getElementById('topContributor'), completedList: document.getElementById('completedList'), incompleteList: document.getElementById('incompleteList'),
  accessList: document.getElementById('accessList'), memberProgress: document.getElementById('memberProgress'), logsList: document.getElementById('logsList'),
  assignmentSummary: document.getElementById('assignmentSummary'), trackingEnabled: document.getElementById('trackingEnabled'), assignmentType: document.getElementById('assignmentType'),
  assignmentName: document.getElementById('assignmentName'), accessIdentifier: document.getElementById('accessIdentifier'), playerSearch: document.getElementById('playerSearch'),
   playerSearchResults: document.getElementById('playerSearchResults'), trackedItemsList: document.getElementById('trackedItemsList'), trackedItemsEditor: document.getElementById('trackedItemsEditor'),
    upgradeList: document.getElementById('upgradeList'), storageTier: document.getElementById('storageTier'), storageStats: document.getElementById('storageStats'), alarmUpgradeCard: document.getElementById('alarmUpgradeCard'), accessUpgradeCard: document.getElementById('accessUpgradeCard'), ownerOnlineRequirementCard: document.getElementById('ownerOnlineRequirementCard'), trackingUpgradeCard: document.getElementById('trackingUpgradeCard'),
    memberProgressList: document.getElementById('memberProgressList'), periodStatus: document.getElementById('periodStatus'), editMemberName: document.getElementById('editMemberName'),
    editItemSelect: document.getElementById('editItemSelect'), editAmountInput: document.getElementById('editAmountInput'), newMemberName: document.getElementById('newMemberName'),
    newMemberCitizenid: document.getElementById('newMemberCitizenid'), periodDaysInput: document.getElementById('periodDaysInput'), archivesList: document.getElementById('archivesList')
 };
const progressModals = { addMember: document.getElementById('addMemberModal'), editProgress: document.getElementById('editProgressModal'), periodSettings: document.getElementById('periodSettingsModal'), archives: document.getElementById('archivesModal') };
let currentEditMember = null;
function setTheme(tokens = {}) { Object.entries(tokens).forEach(([key, value]) => document.documentElement.style.setProperty(`--${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`, value)); }
function itemImage(itemName) { return itemName ? `nui://ox_inventory/web/images/${itemName}.png` : ''; }
function renderItemPill(itemName) { return itemName ? `<img class="item-image" src="${itemImage(itemName)}" onerror="this.classList.add('hidden')" alt="${itemName}">` : ''; }
function row(title, subtitle, right = '', actionHtml = '') { return `<div class="list-row"><div class="list-row__meta"><strong><span>${title}</span></strong><span class="muted">${subtitle}</span></div><div class="list-row__actions">${right}${actionHtml}</div></div>`; }
function rowWithItem(title, subtitle, itemName, right = '', actionHtml = '') { return `<div class="list-row"><div class="list-row__meta"><strong>${renderItemPill(itemName)}<span>${title}</span></strong><span class="muted">${subtitle}</span></div><div class="list-row__actions">${right}${actionHtml}</div></div>`; }
function logRow(entry) {
  let payload = entry && entry.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (_) {}
  }
  const hasPayload = payload && ((Array.isArray(payload) && payload.length) || (typeof payload === 'object' && Object.keys(payload).length));
  const details = hasPayload ? `<details class="log-details"><summary>Details</summary><pre>${JSON.stringify(payload, null, 2)}</pre></details>` : '';
  const actionName = String(entry.action || '').toLowerCase();
  const hideActor = actionName.includes('crack') || actionName.includes('break');
  const actorName = entry.actor_name || entry.actorName || '';
  const subtitle = [(!hideActor && actorName) ? `By ${actorName}` : '', entry.message || ''].filter(Boolean).join(' • ');
  const actorBadge = (!hideActor && actorName) ? `<span class="badge">By ${actorName}</span>` : '';
  return `<div class="list-row log-row"><div class="list-row__meta"><strong><span>${entry.action}</span></strong><span class="muted">${subtitle}</span>${details}</div><div class="list-row__actions">${actorBadge}<span class="badge">${new Date(entry.created_at).toLocaleString()}</span></div></div>`;
}
function trackedRow(item = '', required = 0) { return `<div class="tracked-row"><input class="input tracked-item-name" placeholder="item name" value="${item}"><input class="input tracked-item-required" type="number" min="0" placeholder="required amount" value="${required}"><button class="btn btn-ghost remove-tracked-row" type="button">Remove</button></div>`; }
function setTab(tabId) {
  document.querySelectorAll('.nav__item').forEach(i => i.classList.toggle('active', i.dataset.tab === tabId));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === tabId));
  if (tabId === 'progress' && state && state.safe) {
    post('getTrackerData', { safeId: state.safe.id });
  }
}
function collectTrackedItems() { return [...document.querySelectorAll('.tracked-row')].map(row => ({ item: row.querySelector('.tracked-item-name').value.trim(), required: Number(row.querySelector('.tracked-item-required').value || 0) })).filter(r => r.item); }
function bindDynamic() {
   document.querySelectorAll('[data-remove-access]').forEach(button => button.onclick = () => post('removeAccess', { identifier: button.dataset.removeAccess }));
   document.querySelectorAll('[data-upgrade-tier]').forEach(button => button.onclick = () => post('upgradeStorage', { tier: Number(button.dataset.upgradeTier) }));
   document.querySelectorAll('[data-buy-alarm-upgrade]').forEach(button => button.onclick = () => post('buyAlarmUpgrade'));
    document.querySelectorAll('[data-buy-access-upgrade]').forEach(button => button.onclick = () => post('buyAccessUpgrade'));
    document.querySelectorAll('[data-buy-owner-online-requirement]').forEach(button => button.onclick = () => post('buyOwnerOnlineRequirement'));
    document.querySelectorAll('[data-buy-tracking-upgrade]').forEach(button => button.onclick = () => post('buyTrackingUpgrade'));
   document.querySelectorAll('.remove-tracked-row').forEach(button => button.onclick = () => button.closest('.tracked-row').remove());
  document.querySelectorAll('.perm-toggle').forEach(toggle => toggle.onchange = () => {
    const row = toggle.closest('[data-access-id]');
    post('updatePermissions', { identifier: row.dataset.accessId, permissions: { deposit: row.querySelector('[data-perm="deposit"]').checked, withdraw: row.querySelector('[data-perm="withdraw"]').checked, manage: row.querySelector('[data-perm="manage"]').checked, logs: row.querySelector('[data-perm="logs"]') ? row.querySelector('[data-perm="logs"]').checked : false, viewProgress: row.querySelector('[data-perm="viewProgress"]') ? row.querySelector('[data-perm="viewProgress"]').checked : false } });
  });
  document.querySelectorAll('.search-result[data-player-id]').forEach((button) => {
    button.onclick = () => {
      selectedSearchResult = { identifier: button.dataset.playerId, playerName: button.dataset.playerName };
      els.accessIdentifier.value = selectedSearchResult.identifier;
      els.playerSearch.value = selectedSearchResult.playerName;
      els.playerSearchResults.innerHTML = `<div class="badge">Selected: ${selectedSearchResult.playerName}</div>`;
    };
  });
}
async function searchPlayers(query) { const results = await post('searchPlayers', { query }); renderPlayerResults(Array.isArray(results) ? results : []); }
function renderPlayerResults(results = []) { els.playerSearchResults.innerHTML = results.length ? results.map(entry => `<button class="search-result" data-player-id="${entry.identifier}" data-player-name="${entry.playerName}"><strong>${entry.playerName}</strong><small>${entry.identifier} • ${entry.distance}m</small></button>`).join('') : '<div class="muted">No matching nearby online players.</div>'; bindDynamic(); }
function render(statePayload, mode = 'open') {
    state = statePayload; if (!state) return; const { safe, access, progress, accessList, logs, upgrades, alarmUpgrade, accessUpgrade, ownerOnlineRequirement, trackingUpgrade, theme } = state; setTheme(theme);
  els.title.textContent = safe.safeName || `Safe #${safe.id}`; els.ownerName.textContent = safe.ownerName || 'Unknown'; els.groupAssignment.textContent = safe.assignedGroupName ? `${safe.assignedGroupType}: ${safe.assignedGroupName}` : 'Unassigned';
  els.assignmentSummary.textContent = safe.assignedGroupName ? `Assigned to ${safe.assignedGroupType} / ${safe.assignedGroupName}` : 'No group/business assigned.';
   els.statusText.textContent = access.canManage ? 'Owner / manager control available' : access.canWithdraw ? 'Authorized access' : 'Deposit-only access';
    const logsNav = document.querySelector('.nav__item[data-tab="logs"]');
    if (logsNav) logsNav.style.display = access.canViewLogs ? '' : 'none';
    if (!access.canViewLogs && document.getElementById('logs')?.classList.contains('active')) setTab('overview');
    const trackingNav = document.querySelector('.nav__item[data-tab="tracking"]');
    if (trackingNav) trackingNav.style.display = trackingUpgrade && trackingUpgrade.owned ? '' : 'none';
    if ((!trackingUpgrade || !trackingUpgrade.owned) && document.getElementById('tracking')?.classList.contains('active')) setTab('overview');
    const accessNav = document.querySelector('.nav__item[data-tab="access"]');
    const canShowAccessTab = accessUpgrade && accessUpgrade.owned && access.canManage;
    if (accessNav) accessNav.style.display = canShowAccessTab ? '' : 'none';
    if (!canShowAccessTab && document.getElementById('access')?.classList.contains('active')) setTab('overview');
    const settingsNav = document.querySelector('.nav__item[data-tab="settings"]');
    if (settingsNav) settingsNav.style.display = access.canManage ? '' : 'none';
    if (!access.canManage && document.getElementById('settings')?.classList.contains('active')) setTab('overview');
  els.storageTier.textContent = safe.storageTierLabel || 'Base'; els.storageStats.textContent = `${safe.slots} slots • ${(safe.maxWeight / 1000).toFixed(1)}kg`;
  els.trackedItemsList.innerHTML = (safe.trackedItems || []).length ? safe.trackedItems.map(entry => rowWithItem(entry.item, `${entry.required} required`, entry.item)).join('') : '<div class="muted">No tracked items configured.</div>';
  els.totalProgressText.textContent = `${progress.total || 0} / ${progress.totalRequired || 0}`; els.totalProgressBar.style.width = `${Math.min(progress.totalPercent || 0, 100)}%`; els.topContributor.textContent = progress.topContributor ? `Top: ${progress.topContributor.player_name} (${progress.topContributor.total_progress})` : 'No top contributor';
  els.completedList.innerHTML = (progress.completed || []).length ? progress.completed.map(entry => rowWithItem(entry.player_name, `${entry.item_name} • ${entry.total_progress}/${entry.required}`, entry.item_name, `<span class="badge">Completed</span>`)).join('') : '<div class="muted">No completed contributors yet.</div>';
  els.incompleteList.innerHTML = (progress.incomplete || []).length ? progress.incomplete.map(entry => rowWithItem(entry.player_name, `${entry.item_name} • ${entry.total_progress}/${entry.required}`, entry.item_name, `<span class="badge">${entry.percent}%</span>`)).join('') : '<div class="muted">No incomplete contributors right now.</div>';
  els.memberProgress.innerHTML = (progress.members || []).length ? progress.members.map(entry => rowWithItem(entry.player_name, `${entry.item_name || 'No item'} • ${entry.total_progress}/${entry.required}`, entry.item_name, `<span class="badge">${entry.statusLabel}</span>`)).join('') : '<div class="muted">Tracking data will appear here.</div>';
   els.logsList.innerHTML = (logs || []).length ? logs.map(entry => logRow(entry)).join('') : '<div class="muted">Logging disabled or no activity yet.</div>';
   const pickupBtn = document.getElementById('pickupSafeBtn');
   if (pickupBtn) pickupBtn.style.display = access.isOwner ? '' : 'none';
  els.accessList.innerHTML = (accessList || []).length ? accessList.map(entry => `<div class="list-row" data-access-id="${entry.player_identifier}"><div class="list-row__meta"><strong><span>${entry.player_name}</span></strong><span class="muted">${entry.player_identifier}</span></div><div class="list-row__actions permission-grid"><label><input class="perm-toggle" data-perm="deposit" type="checkbox" ${entry.can_deposit == 1 ? 'checked' : ''}> Deposit</label><label><input class="perm-toggle" data-perm="withdraw" type="checkbox" ${entry.can_withdraw == 1 ? 'checked' : ''}> Withdraw</label><label><input class="perm-toggle" data-perm="manage" type="checkbox" ${entry.can_manage == 1 ? 'checked' : ''}> Manage</label><label><input class="perm-toggle" data-perm="logs" type="checkbox" ${entry.can_view_logs == 1 ? 'checked' : ''}> Logs</label><label><input class="perm-toggle" data-perm="viewProgress" type="checkbox" ${entry.can_view_progress == 1 ? 'checked' : ''}> Progress</label><button class="btn btn-ghost" data-remove-access="${entry.player_identifier}">Remove</button></div></div>`).join('') : '<div class="muted">No users added.</div>';
  els.trackingEnabled.checked = !!safe.trackingEnabled; els.assignmentType.value = safe.assignedGroupType || ''; els.assignmentName.value = safe.assignedGroupName || ''; els.accessIdentifier.value = ''; if (mode === 'open') { els.playerSearch.value = ''; els.playerSearchResults.innerHTML = '<div class="muted">Search for a nearby online player to add them.</div>'; }
   els.trackedItemsEditor.innerHTML = (safe.trackedItems || []).length ? safe.trackedItems.map(entry => trackedRow(entry.item, entry.required)).join('') : trackedRow('', 0);
    const nextTier = (upgrades || []).find(entry => entry.tier > safe.storageTier);
   if (nextTier) {
     els.upgradeList.innerHTML = row(nextTier.label, `${nextTier.price} ${safe.alarmUpgrade?.currency || 'cash'} • ${nextTier.slots} slots • ${(nextTier.maxWeight / 1000).toFixed(1)}kg`, '', `<button class="btn btn-primary" data-upgrade-tier="${nextTier.tier}">Upgrade</button>`);
   } else {
     els.upgradeList.innerHTML = '<div class="muted">Max upgraded</div>';
   }
   document.querySelectorAll('#access input, #access button, #settings input, #settings button').forEach(el => {
     if (el.id !== 'closeBtn') el.disabled = !access.canManage;
   });
   if (els.alarmUpgradeCard) {
      if (alarmUpgrade && alarmUpgrade.enabled) {
        els.alarmUpgradeCard.innerHTML = row(alarmUpgrade.label || 'Alarm Upgrade', `${alarmUpgrade.price} ${alarmUpgrade.currency || 'cash'} • Sends the owner a live alert when a break-in starts`, alarmUpgrade.owned ? '<span class="badge">Installed</span>' : '', !alarmUpgrade.owned ? '<button class="btn btn-primary" data-buy-alarm-upgrade="1">Buy Upgrade</button>' : '');
      } else {
        els.alarmUpgradeCard.innerHTML = '<div class="muted">Alarm upgrades are disabled.</div>';
      }
    }
    if (els.accessUpgradeCard) {
      if (accessUpgrade && accessUpgrade.enabled) {
        els.accessUpgradeCard.innerHTML = row(accessUpgrade.label || 'Access Control', `${accessUpgrade.price} ${accessUpgrade.currency || 'cash'} • ${accessUpgrade.description || 'Restricts stash access to allowed users only'}`, accessUpgrade.owned ? '<span class="badge">Active</span>' : '', !accessUpgrade.owned ? '<button class="btn btn-primary" data-buy-access-upgrade="1">Buy Upgrade</button>' : '');
      } else {
        els.accessUpgradeCard.innerHTML = '<div class="muted">Access upgrades are disabled.</div>';
      }
    }
     if (els.ownerOnlineRequirementCard) {
      if (ownerOnlineRequirement && ownerOnlineRequirement.enabled) {
        els.ownerOnlineRequirementCard.innerHTML = row(ownerOnlineRequirement.label || 'Owner Online Requirement', `${ownerOnlineRequirement.price} ${ownerOnlineRequirement.currency || 'cash'} • ${ownerOnlineRequirement.description || 'Requires the safe owner to be online for break-ins'}`, ownerOnlineRequirement.owned ? '<span class="badge">Active</span>' : '', !ownerOnlineRequirement.owned ? '<button class="btn btn-primary" data-buy-owner-online-requirement="1">Buy Upgrade</button>' : '');
      } else {
        els.ownerOnlineRequirementCard.innerHTML = '<div class="muted">Owner online requirement upgrades are disabled.</div>';
      }
    }
    if (els.trackingUpgradeCard) {
      if (trackingUpgrade && trackingUpgrade.enabled) {
        els.trackingUpgradeCard.innerHTML = row(trackingUpgrade.label || 'Member Tracking', `${trackingUpgrade.price} ${trackingUpgrade.currency || 'cash'} • ${trackingUpgrade.description || 'Enables member contribution tracking'}`, trackingUpgrade.owned ? '<span class="badge">Unlocked</span>' : '', !trackingUpgrade.owned ? '<button class="btn btn-primary" data-buy-tracking-upgrade="1">Buy Upgrade</button>' : '');
      } else {
        els.trackingUpgradeCard.innerHTML = '<div class="muted">Tracking upgrades are disabled.</div>';
      }
    }
    bindDynamic();
}
window.addEventListener('message', (event) => {
  const { action, payload } = event.data || {};
  if (action === 'open') {
    app.classList.remove('hidden');
    app.setAttribute('aria-hidden', 'false');
    render(payload, 'open');
  }
  if (action === 'update') {
    render(payload, 'update');
  }
  if (action === 'close') {
    app.classList.add('hidden');
    app.setAttribute('aria-hidden', 'true');
    state = null;
  }
  if (action === 'safeUnderAttack') {
    showAlarmOverlay(payload);
  }
  if (action === 'trackerData') {
    trackerState = { members: payload.members || [], progress: payload.progress || {}, isLeader: payload.isLeader || false };
    renderProgressTab(payload);
  }
  if (action === 'trackerMemberAdded' || action === 'trackerMemberRemoved' || action === 'progressUpdated' || action === 'periodEnded' || action === 'periodDaysSet') {
    if (state && state.safe) {
      post('getTrackerData', { safeId: state.safe.id });
    }
  }
  if (action === 'archivesData') {
    renderArchivesModal(payload.archives || []);
  }
});
document.getElementById('closeBtn').onclick = () => post('close'); document.getElementById('depositBtn').onclick = () => post('deposit'); document.getElementById('withdrawBtn').onclick = () => post('withdraw'); document.getElementById('resetProgressBtn').onclick = () => post('resetProgress'); document.getElementById('pickupSafeBtn').onclick = () => post('pickupSafe'); document.getElementById('selectTrackedItemBtn').onclick = () => post('selectTrackedItem'); document.getElementById('saveSettingsBtn').onclick = () => post('saveSettings', { trackingEnabled: els.trackingEnabled.checked, trackedItems: collectTrackedItems(), assignedGroupType: els.assignmentType.value, assignedGroupName: els.assignmentName.value }); document.getElementById('addAccessBtn').onclick = () => { const identifier = (selectedSearchResult && selectedSearchResult.identifier) || els.accessIdentifier.value.trim(); if (!identifier) return; post('addAccess', { identifier }); }; document.getElementById('addTrackedRowBtn').onclick = () => { els.trackedItemsEditor.insertAdjacentHTML('beforeend', trackedRow('', 0)); bindDynamic(); };
document.querySelectorAll('.nav__item').forEach(button => button.onclick = () => setTab(button.dataset.tab));
els.playerSearch.addEventListener('input', () => { clearTimeout(searchTimer); const query = els.playerSearch.value.trim(); if (!query) { els.accessIdentifier.value = ''; selectedSearchResult = null; els.playerSearchResults.innerHTML = '<div class="muted">Search for a nearby online player to add them.</div>'; return; } searchTimer = setTimeout(() => searchPlayers(query), 150); });
document.addEventListener('keyup', (event) => { if (event.key === 'Escape') post('close'); });

// Alarm sound toggle
const alarmSoundToggle = document.getElementById('alarmSoundToggle');
if (alarmSoundToggle) {
  alarmSoundToggle.checked = alarmSoundEnabled;
  alarmSoundToggle.addEventListener('change', () => {
    alarmSoundEnabled = alarmSoundToggle.checked;
    localStorage.setItem('alarmSoundEnabled', String(alarmSoundEnabled));
  });
}

// Progress tab rendering
function renderProgressTab(data) {
  if (!state || !state.safe) return;
  
  const safeData = data.safeData || {};
  const items = safeData.items || [];
  const percentages = safeData.percentages || {};
  const periodDays = safeData.period_days || 0;
  const periodStart = safeData.period_start;
  
  let periodText = 'No active period';
  if (periodDays === 0) {
    periodText = 'Manual period (no auto-end)';
  } else if (periodStart) {
    const startDate = new Date(periodStart);
    const endDate = new Date(startDate.getTime() + periodDays * 24 * 60 * 60 * 1000);
    const remaining = Math.max(0, Math.ceil((endDate - new Date()) / (24 * 60 * 60 * 1000)));
    periodText = `${periodDays} day period • ${remaining} days remaining`;
  }
  
  if (els.periodStatus) els.periodStatus.textContent = periodText;
  
  const progressNav = document.querySelector('.nav__item[data-tab="progress"]');
  if (progressNav) {
    const canViewProgress = state.access && (state.access.canManage || state.trackingUpgrade?.owned);
    progressNav.style.display = canViewProgress ? '' : 'none';
    if (!canViewProgress && document.getElementById('progress')?.classList.contains('active')) setTab('overview');
  }
  
  if (els.memberProgressList) {
    if (!data.members || data.members.length === 0) {
      els.memberProgressList.innerHTML = '<div class="muted">No members added to tracker.</div>';
    } else {
      els.memberProgressList.innerHTML = data.members.map(member => {
        const memberProgress = data.progress[member.member_name] || {};
        const progressRows = items.map(item => {
          const amount = memberProgress[item.name] || 0;
          const required = item.required || 0;
          const percent = required > 0 ? Math.round((amount / required) * 100) : 0;
          return `
            <div class="progress-row">
              <div class="progress-row__label">
                <span class="progress-row__item-name">${item.label || item.name}</span>
                <span class="progress-row__percentage">${percentages[item.name] ? `${percentages[item.name].toFixed(1)}% of total` : ''}</span>
              </div>
              <span class="progress-row__value">${amount}/${required}</span>
            </div>
          `;
        }).join('');
        
        const editBtn = data.isLeader ? `<button class="btn btn-secondary btn-sm" data-edit-member="${member.member_name}">Edit</button>` : '';
        const removeBtn = data.isLeader ? `<button class="btn btn-ghost btn-sm" data-remove-member="${member.member_name}">Remove</button>` : '';
        
        return `
          <div class="member-item">
            <div class="member-item__header">
              <span class="member-item__name">${member.member_name}</span>
              <div class="member-item__actions">${editBtn}${removeBtn}</div>
            </div>
            <div class="member-item__progress">${progressRows}</div>
          </div>
        `;
      }).join('');
    }
  }
  
  bindProgressDynamic();
}

function bindProgressDynamic() {
  if (!state || !state.safe) return;
  
  document.querySelectorAll('[data-edit-member]').forEach(btn => {
    btn.onclick = () => {
      currentEditMember = btn.dataset.editMember;
      if (els.editMemberName) els.editMemberName.textContent = currentEditMember;
      if (els.editItemSelect) {
        const items = (state.safeData && state.safeData.items) || [];
        els.editItemSelect.innerHTML = items.map(item => `<option value="${item.name}">${item.label || item.name}</option>`).join('');
      }
      if (els.editAmountInput) els.editAmountInput.value = 0;
      openModal('editProgress');
    };
  });
  
  document.querySelectorAll('[data-remove-member]').forEach(btn => {
    btn.onclick = () => {
      const memberName = btn.dataset.removeMember;
      post('removeTrackerMember', { safeId: state.safe.id, memberName });
    };
  });
}

function renderArchivesModal(archives) {
  if (els.archivesList) {
    if (archives.length === 0) {
      els.archivesList.innerHTML = '<div class="muted">No archived periods.</div>';
    } else {
      els.archivesList.innerHTML = archives.map(archive => {
        const startDate = new Date(archive.period_start).toLocaleDateString();
        const endDate = new Date(archive.period_end).toLocaleDateString();
        return `<div class="archive-item"><div class="archive-item__period">${startDate} — ${endDate}</div><div class="archive-item__summary">Click to view details</div></div>`;
      }).join('');
    }
  }
  openModal('archives');
}

function openModal(name) {
  if (progressModals[name]) {
    progressModals[name].classList.remove('hidden');
    progressModals[name].setAttribute('aria-hidden', 'false');
  }
}

function closeModal(name) {
  if (progressModals[name]) {
    progressModals[name].classList.add('hidden');
    progressModals[name].setAttribute('aria-hidden', 'true');
  }
}

function closeAllModals() {
  Object.keys(progressModals).forEach(name => closeModal(name));
}

// Progress tab event handlers
document.getElementById('addMemberBtn')?.addEventListener('click', () => {
  if (els.newMemberName) els.newMemberName.value = '';
  if (els.newMemberCitizenid) els.newMemberCitizenid.value = '';
  openModal('addMember');
});

document.getElementById('archiveBtn')?.addEventListener('click', () => {
  if (state && state.safe) {
    post('getArchives', { safeId: state.safe.id });
  }
});

document.getElementById('endPeriodBtn')?.addEventListener('click', () => {
  if (state && state.safe) {
    post('endPeriod', { safeId: state.safe.id });
  }
});

document.getElementById('confirmAddMemberBtn')?.addEventListener('click', () => {
  const memberName = els.newMemberName?.value.trim();
  if (!memberName || !state || !state.safe) return;
  const citizenid = els.newMemberCitizenid?.value.trim() || null;
  post('addTrackerMember', { safeId: state.safe.id, memberName, linkedCitizenid: citizenid });
  closeModal('addMember');
});

document.getElementById('cancelAddMemberBtn')?.addEventListener('click', () => closeModal('addMember'));

document.getElementById('confirmEditProgressBtn')?.addEventListener('click', () => {
  if (!currentEditMember || !state || !state.safe) return;
  const itemName = els.editItemSelect?.value;
  const amount = parseInt(els.editAmountInput?.value) || 0;
  post('adjustProgress', { safeId: state.safe.id, memberName: currentEditMember, itemName, amount });
  closeModal('editProgress');
  currentEditMember = null;
});

document.getElementById('cancelEditProgressBtn')?.addEventListener('click', () => {
  closeModal('editProgress');
  currentEditMember = null;
});

document.getElementById('confirmPeriodDaysBtn')?.addEventListener('click', () => {
  if (!state || !state.safe) return;
  const days = parseInt(els.periodDaysInput?.value) || 0;
  post('setPeriodDays', { safeId: state.safe.id, days });
  closeModal('periodSettings');
});

document.getElementById('cancelPeriodDaysBtn')?.addEventListener('click', () => closeModal('periodSettings'));

document.getElementById('closeArchivesBtn')?.addEventListener('click', () => closeModal('archives'));

// Close modal on backdrop click
Object.values(progressModals).forEach(modal => {
  if (modal) {
    modal.querySelector('.modal__backdrop')?.addEventListener('click', () => {
      closeAllModals();
    });
  }
});
