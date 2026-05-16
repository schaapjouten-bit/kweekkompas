// --- CRITICAL REPAIR SYSTEM V1.3.1 ---
console.log("🚀 KWEEKKOMPAS REPAIR ENGINE STARTING...");

let isSettingsOpen = false;

// Global State
window.userProfile = JSON.parse(localStorage.getItem('moestuin_user_profile')) || JSON.parse(localStorage.getItem('userProfile')) || {
    name: '',
    climate: 'Nederland (Zeeklimaat)',
    units: 'Metric',
    light: '', 
    level: '',
    photo: ''
};

window.toggleSettingsPanel_REPAIR_V131 = function() {
    isSettingsOpen = !isSettingsOpen;
    renderSettingsPanel();
}

window.openInfoModal = function(section) {
    console.log("Opening modal section:", section);
    const modal = document.getElementById('info-modal');
    if (!modal) { console.error("Modal #info-modal not found!"); return; }
    
    // Hide all views
    document.querySelectorAll('.info-view').forEach(v => v.classList.add('hidden'));
    
    const targetView = document.getElementById('info-view-' + section);
    if (targetView) {
        targetView.classList.remove('hidden');
    } else {
        console.error("View not found: info-view-" + section);
    }
    
    const title = document.getElementById('info-modal-title');
    if (title) {
        const titles = { 
            'about': 'Over KweekKompas', 
            'faq': 'Veelgestelde vragen', 
            'privacy': 'Privacy', 
            'data': 'Data & Opslag', 
            'profile': '👤 Profiel Bewerken' 
        };
        title.textContent = titles[section] || 'Info & Support';
    }
    
    if (section === 'profile') {
        const iN = document.getElementById('profile-input-name');
        const iC = document.getElementById('profile-input-climate');
        const iU = document.getElementById('profile-input-units');
        if (iN) iN.value = window.userProfile.name || '';
        if (iC) iC.value = window.userProfile.climate || '';
        if (iU) iU.value = window.userProfile.units || 'Metric';
        
        // 🔥 Foto updaten
        const avatar = targetView.querySelector('.profile-avatar');
        if (avatar) {
            avatar.src = window.userProfile.photo || 'assets/default-avatar.png';
        }
    }
    
    modal.classList.remove('hidden');
};

window.closeInfoModal = function() {
    document.getElementById('info-modal')?.classList.add('hidden');
};

window.saveUserProfile = function() {
    const iN = document.getElementById('profile-input-name');
    const iC = document.getElementById('profile-input-climate');
    const iU = document.getElementById('profile-input-units');
    window.userProfile.name = iN ? iN.value : window.userProfile.name;
    window.userProfile.climate = iC ? iC.value : window.userProfile.climate;
    window.userProfile.units = iU ? iU.value : window.userProfile.units;
    localStorage.setItem('moestuin_user_profile', JSON.stringify(window.userProfile));
    if (window.updateProfileUI) window.updateProfileUI();
    if (isSettingsOpen) renderSettingsPanel();
    window.closeInfoModal();
    if (typeof showToast === 'function') showToast("Profiel opgeslagen! ✅");
};

function renderSettingsPanel() {
    const panel = document.getElementById('settings-panel');
    const overlay = document.getElementById('settings-overlay');
    if (!panel || !overlay) {
        console.error("ELEMENTS NOT FOUND!");
        return;
    }

    if (isSettingsOpen) {
        panel.classList.add('open');
        overlay.classList.remove('hidden');
        // Re-render to ensure theme labels and state are correct
        panel.innerHTML = getSettingsHTML();
    } else {
        panel.classList.remove('open');
        overlay.classList.add('hidden');
        // We no longer destroy panel.innerHTML on close!
    }
}

window.openSettingsModal = function(html) {
  let modal = document.getElementById('settings-generic-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'settings-generic-modal';
  modal.className = 'modal-overlay';
  modal.style.zIndex = '30000';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 440px; width: 90%; margin: auto; background: #1E201E; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 20px 40px rgba(0,0,0,0.5); position: relative;">
      <button class="modal-close-btn" style="position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,0.05); border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #D1D5DB; cursor: pointer; z-index: 10;" onclick="document.getElementById('settings-generic-modal').remove()">✕</button>
      <div class="modal-body" style="padding: 24px 16px; overflow-y: auto;">
        ${html}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
}

window.openSettingsSection = function(section) {
    if (section === 'profile') window.openSettingsModal(getProfileHTML());
    if (section === 'about') window.openSettingsModal(getAboutHTML());
    if (section === 'storage') window.openSettingsModal(getDataStorageHTML());
    if (section === 'faq') window.openSettingsModal(getFAQHTML());
}

function getProfileHTML() {
  const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
  const name = profile.name || '';
  const experience = profile.experience || 'Beginner';
  const climate = profile.climate || 'Nederland (Zeeklimaat)';
  const units = profile.units || 'Metric';

  return `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      
      <div style="text-align:center; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: var(--text-main);">Jouw profiel</h2>
      </div>

      <!-- FOTO / AVATAR TOOL -->
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px;">
        <div style="position: relative;">
          <div id="profile-avatar-container" 
               style="width: 120px; height: 120px; border-radius: 50%; overflow: hidden; border: 3px solid rgba(255,255,255,0.1); background: #2a2c2a; cursor: grab; position: relative; display: flex; align-items: center; justify-content: center;"
               onmousedown="window.initAvatarDrag(event)"
               ontouchstart="window.initAvatarDrag(event)">
            <img id="profile-avatar-preview" 
                 src="${profile.photo || 'assets/default-avatar.png'}" 
                 style="position: absolute; width: 100%; height: 100%; object-fit: cover; pointer-events: none; transform: scale(${profile.photoZoom || 1}) translate(${profile.photoX || 0}px, ${profile.photoY || 0}px); transition: transform 0.1s ease-out; transform-origin: center;">
          </div>
          <div onclick="document.getElementById('profile-photo-upload').click()" 
               style="position: absolute; z-index: 10; bottom: 4px; right: 4px; background: #648166; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; border: 3px solid #1E201E; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer;">✏️</div>
        </div>
        
        <!-- ZOOM CONTROLS -->
        <div style="width: 160px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; opacity: 0.6; color: #fff;">
            <span>Zoom</span>
            <span id="zoom-value">${Math.round((profile.photoZoom || 1) * 100)}%</span>
          </div>
          <input type="range" min="1" max="3" step="0.05" value="${profile.photoZoom || 1}" 
                 style="width: 100%; accent-color: #648166; cursor: pointer;"
                 oninput="window.handleAvatarZoom(this.value)">
          <p style="font-size: 10px; opacity: 0.4; text-align: center; margin-top: 4px;">Sleep de foto om te verplaatsen</p>
        </div>

        <input type="file" id="profile-photo-upload" accept="image/*" style="display:none;" onchange="window.handleProfilePhotoUpload(event)">
      </div>

      <!-- NAAM -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Jouw Naam</label>
        <input type="text" value="${name}" placeholder="Hoe mogen we je noemen?" onchange="window.saveProfileField('name', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit;">
      </div>

      <!-- ERVARING -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Ervaring</label>
        <select onchange="window.saveProfileField('experience', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit; appearance: none; position: relative;">
          <option value="Beginner" ${experience === 'Beginner' ? 'selected' : ''}>Beginner (Startende tuinder)</option>
          <option value="Gemiddeld" ${experience === 'Gemiddeld' ? 'selected' : ''}>Gemiddeld (Al oogst gehad)</option>
          <option value="Expert" ${experience === 'Expert' ? 'selected' : ''}>Expert (Groene vingers)</option>
        </select>
      </div>

      <!-- ZONE -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Klimaatzone</label>
        <select onchange="window.saveProfileField('climate', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit; appearance: none;">
          <option value="Nederland (Zeeklimaat)" ${climate.includes('Nederland') ? 'selected' : ''}>Nederland / België (Zeeklimaat)</option>
          <option value="Warm (Subtropisch)" ${climate.includes('Warm') ? 'selected' : ''}>Warm / Kas (Subtropisch)</option>
          <option value="Koud (Continentaal)" ${climate.includes('Koud') ? 'selected' : ''}>Koud (Continentaal)</option>
        </select>
      </div>

      <!-- EENHEDEN -->
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Eenheden</label>
        <select onchange="window.saveProfileField('units', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit; appearance: none;">
          <option value="Metric" ${units === 'Metric' || units === 'cm / °C' ? 'selected' : ''}>Metrisch (cm / °C)</option>
          <option value="Imperial" ${units === 'Imperial' || units !== 'Metric' ? 'selected' : ''}>Imperiaal (inch / °F)</option>
        </select>
      </div>

      <!-- TYPE TUIN -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Type Tuin</label>
        <select onchange="window.saveProfileField('gardenType', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit; appearance: none;">
          <option value="Achtertuin" ${profile.gardenType === 'Achtertuin' ? 'selected' : ''}>Achtertuin</option>
          <option value="Balkon" ${profile.gardenType === 'Balkon' ? 'selected' : ''}>Balkon</option>
          <option value="Volkstuin" ${profile.gardenType === 'Volkstuin' ? 'selected' : ''}>Volkstuin</option>
          <option value="Geen" ${profile.gardenType === 'Geen' ? 'selected' : ''}>Geen (potten)</option>
        </select>
      </div>

      <button onclick="document.getElementById('settings-generic-modal').remove()" style="margin-top: 16px; width: 100%; border-radius: 12px; padding: 14px; background: #648166; color: white; border: none; font-weight: bold; font-size: 15px; cursor: pointer;">Opslaan & Sluiten</button>
    </div>
  `;
}

window.saveProfileField = function(key, value) {
  let profile = JSON.parse(localStorage.getItem('userProfile') || localStorage.getItem('moestuin_user_profile') || '{}');
  profile[key] = value;
  localStorage.setItem('userProfile', JSON.stringify(profile));
  localStorage.setItem('moestuin_user_profile', JSON.stringify(profile));
  window.userProfile = profile;
  
  if (key === 'name') {
    const el = document.getElementById('settings-drawer-name');
    if (el) el.textContent = value || 'Jouw profiel';
  }
  if (key === 'photo') {
    const el = document.getElementById('settings-drawer-photo');
    if (el) {
       el.src = value;
       el.style.display = 'block';
       if(el.nextElementSibling) el.nextElementSibling.style.display = 'none';
    }
  }
};

window.handleProfilePhotoUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const dataUrl = event.target.result;
    // Reset zoom and position on new upload
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    profile.photo = dataUrl;
    profile.photoZoom = 1;
    profile.photoX = 0;
    profile.photoY = 0;
    localStorage.setItem('userProfile', JSON.stringify(profile));
    localStorage.setItem('moestuin_user_profile', JSON.stringify(profile));
    window.userProfile = profile;

    const preview = document.getElementById('profile-avatar-preview');
    if (preview) {
      preview.src = dataUrl;
      preview.style.transform = 'scale(1) translate(0px, 0px)';
    }
    const zoomSlider = document.querySelector('input[type="range"]');
    if (zoomSlider) zoomSlider.value = 1;
    const zoomVal = document.getElementById('zoom-value');
    if (zoomVal) zoomVal.textContent = '100%';
  };
  reader.readAsDataURL(file);
};

// --- AVATAR MANIPULATION HELPERS ---

let isDraggingAvatar = false;
let startX, startY, initialX, initialY;

window.handleAvatarZoom = function(val) {
    const preview = document.getElementById('profile-avatar-preview');
    const zoomVal = document.getElementById('zoom-value');
    if (!preview) return;
    
    // Get current translation from userProfile
    const profile = window.userProfile || {};
    const x = profile.photoX || 0;
    const y = profile.photoY || 0;
    
    preview.style.transform = `scale(${val}) translate(${x}px, ${y}px)`;
    if (zoomVal) zoomVal.textContent = Math.round(val * 100) + '%';
    
    // Auto-save zoom state
    window.saveProfileField('photoZoom', parseFloat(val));
};

window.initAvatarDrag = function(e) {
    e.preventDefault();
    isDraggingAvatar = true;
    const container = document.getElementById('profile-avatar-container');
    if (container) container.style.cursor = 'grabbing';
    
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    
    startX = clientX;
    startY = clientY;
    
    const profile = window.userProfile || {};
    initialX = profile.photoX || 0;
    initialY = profile.photoY || 0;
    
    document.addEventListener('mousemove', window.doAvatarDrag);
    document.addEventListener('mouseup', window.stopAvatarDrag);
    document.addEventListener('touchmove', window.doAvatarDrag, { passive: false });
    document.addEventListener('touchend', window.stopAvatarDrag);
};

window.doAvatarDrag = function(e) {
    if (!isDraggingAvatar) return;
    if (e.type === 'touchmove') e.preventDefault();
    
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    
    const dx = (clientX - startX);
    const dy = (clientY - startY);
    
    const newX = initialX + dx;
    const newY = initialY + dy;
    
    const preview = document.getElementById('profile-avatar-preview');
    if (preview) {
        const profile = window.userProfile || {};
        const zoom = profile.photoZoom || 1;
        preview.style.transform = `scale(${zoom}) translate(${newX}px, ${newY}px)`;
        
        // Update local memory but dont save to localStorage every pixel for performance
        profile.photoX = newX;
        profile.photoY = newY;
    }
};

window.stopAvatarDrag = function() {
    if (!isDraggingAvatar) return;
    isDraggingAvatar = false;
    const container = document.getElementById('profile-avatar-container');
    if (container) container.style.cursor = 'grab';
    
    document.removeEventListener('mousemove', window.doAvatarDrag);
    document.removeEventListener('mouseup', window.stopAvatarDrag);
    document.removeEventListener('touchmove', window.doAvatarDrag);
    document.removeEventListener('touchend', window.stopAvatarDrag);
    
    // Final save of position
    const profile = window.userProfile || {};
    localStorage.setItem('userProfile', JSON.stringify(profile));
    localStorage.setItem('moestuin_user_profile', JSON.stringify(profile));
};

function getAboutHTML() {
  return `
    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; color: #fff;">
      
      <!-- ICON GRAPHIC -->
      <div style="position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <div style="position: absolute; width: 140px; height: 100px;">
          <span style="position: absolute; top: 10%; left: 0px; color: #5B8A61; font-size: 12px;">✦</span>
          <span style="position: absolute; top: 5%; right: 10%; color: #5B8A61; font-size: 8px;">✦</span>
          <span style="position: absolute; bottom: 20%; left: 15%; color: #5B8A61; font-size: 8px;">✦</span>
          <span style="position: absolute; bottom: 10%; right: -10px; color: #5B8A61; font-size: 12px;">✦</span>
        </div>
        
        <div style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid #5B8A61; display: flex; align-items: center; justify-content: center; background: rgba(91, 138, 97, 0.1); position: relative; z-index: 2;">
          <span style="font-size: 32px;">🌱</span>
        </div>
      </div>

      <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px; color: #fff;">Over de app</h2>
      
      <!-- Green Separator -->
      <div style="width: 24px; height: 3px; background: #648166; border-radius: 4px; margin-bottom: 32px;"></div>

      <div style="text-align: left; width: 100%; display: flex; flex-direction: column; gap: 24px;">
        
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">🌱</span>
            <strong style="font-size: 15px;">Over KweekKompas</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">KweekKompas helpt je simpel en overzichtelijk bij het plannen, zaaien en verzorgen van je planten.</p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #9CA3AF; font-style: italic;">Altijd weten wat je wanneer moet doen — zonder gedoe.</p>
        </div>

        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">🔒</span>
            <strong style="font-size: 15px;">Jouw gegevens</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">Je gegevens blijven op jouw apparaat. KweekKompas verstuurt niets naar externe servers.</p>
        </div>

      </div>

      <button onclick="document.getElementById('settings-generic-modal').remove()" style="margin-top: 40px; width: 100%; border-radius: 12px; padding: 14px; background: #648166; color: white; border: none; font-weight: 700; font-size: 15px; cursor: pointer;">Begrepen</button>
      
    </div>
  `;
}

function getDataStorageHTML() {
  return `
    <div style="display: flex; flex-direction: column; color: #fff;">
      
      <h2 class="modal-title">💾 Data & Opslag</h2>
      <p class="modal-subtitle">Beheer je gegevens eenvoudig en veilig.</p>

      <div class="data-section">
        <h4>💾 Backup maken</h4>
        <p>Sla je huidige gegevens op in een bestand voor later.</p>
        <button class="data-button" onclick="exportData()">Backup bouwen</button>
      </div>

      <div class="data-section">
        <h4>♻️ Herstellen</h4>
        <p>Herstel je gegevens vanuit een eerdere backup.</p>
        <button class="data-button" onclick="restoreBackup()">Backup herstellen</button>
      </div>

      <div class="data-section">
        <h4>📥 Importeren</h4>
        <p>Importeer gegevens uit een extern bestand.</p>
        <button class="data-button" onclick="importData()">Data importeren</button>
      </div>

      <div class="data-section data-warning">
        <h4>⚠️ Reset applicatie</h4>
        <p>Verwijder alle zaden en instellingen. Dit is definitief.</p>
        <button class="data-button" onclick="resetApp()">Alles verwijderen</button>
      </div>

      <button class="modal-footer-button" onclick="document.getElementById('settings-generic-modal').remove()">Sluiten</button>
      
    </div>
  `;
}

if (typeof window.restoreBackup !== 'function' || true) {
  window.restoreBackup = function() {
    window.importData();
  };
}

function getFAQHTML() {
  return `
    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; color: #fff;">
      
      <!-- ICON GRAPHIC -->
      <div style="position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <div style="position: absolute; width: 140px; height: 100px;">
          <span style="position: absolute; top: 10%; left: 0px; color: #5B8A61; font-size: 12px;">✦</span>
          <span style="position: absolute; top: 5%; right: 10%; color: #5B8A61; font-size: 8px;">✦</span>
          <span style="position: absolute; bottom: 20%; left: 15%; color: #5B8A61; font-size: 8px;">✦</span>
          <span style="position: absolute; bottom: 10%; right: -10px; color: #5B8A61; font-size: 12px;">✦</span>
        </div>
        
        <div style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid #5B8A61; display: flex; align-items: center; justify-content: center; background: rgba(91, 138, 97, 0.1); position: relative; z-index: 2;">
          <span style="font-size: 32px;">❓</span>
        </div>
      </div>

      <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px; color: #fff;">Veelgestelde vragen</h2>
      
      <!-- Green Separator -->
      <div style="width: 24px; height: 3px; background: #648166; border-radius: 4px; margin-bottom: 32px;"></div>

      <div style="text-align: left; width: 100%; display: flex; flex-direction: column; gap: 24px;">
        
        <div class="faq-item">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">🌱</span>
            <strong style="font-size: 15px;">Hoe werkt de app?</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">Voeg je zaden toe, bekijk wat je wanneer kunt zaaien en volg je taken via de planner en kalender.</p>
        </div>

        <div class="faq-item">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">💾</span>
            <strong style="font-size: 15px;">Worden mijn gegevens opgeslagen?</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">Ja. Alles wordt lokaal opgeslagen op jouw apparaat. Niets wordt naar externe servers verstuurd.</p>
        </div>

        <div class="faq-item">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">📥</span>
            <strong style="font-size: 15px;">Kan ik een backup maken?</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">Ja. Via Data & Opslag kun je je gegevens exporteren en later weer herstellen.</p>
        </div>

      </div>

      <button onclick="document.getElementById('settings-generic-modal').remove()" style="margin-top: 40px; width: 100%; border-radius: 12px; padding: 14px; background: #648166; color: white; border: none; font-weight: 700; font-size: 15px; cursor: pointer;">Begrepen</button>
      
    </div>
  `;
}

function getSettingsHTML() {
    const profile = window.userProfile || { name: '', climate: 'Nederland', units: 'Metric', experience: 'Beginner' };
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    return `
        <div class="settings-header">
            <h2>Instellingen</h2>
            <button onclick="toggleSettingsPanel_REPAIR_V131()" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer; opacity:0.6;">✕</button>
        </div>
        
        <div class="settings-content" style="flex: 1; overflow-y: auto;">
            
            <!-- PROFIEL CARD -->
            <div class="settings-profile-card">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; overflow: hidden; border: 2px solid rgba(255,255,255,0.1); background: #2a2c2a; flex-shrink: 0; display: flex; align-items: center; justify-content: center; position: relative;">
                        <img id="settings-drawer-photo" src="${profile.photo || 'assets/default-avatar.png'}" 
                             style="position: absolute; width: 100%; height: 100%; object-fit: cover; transform: scale(${profile.photoZoom || 1}) translate(${(profile.photoX || 0) * (56/120)}px, ${(profile.photoY || 0) * (56/120)}px); transform-origin: center;">
                    </div>
                    <div>
                        <p style="font-weight: 700; font-size: 18px; color: #fff; opacity: 1; margin: 0; letter-spacing: -0.3px;">${profile.name || 'Jouw profiel'}</p>
                        <p style="font-size: 13px; opacity: 0.6; margin: 2px 0;">${profile.gardenType || 'Geen type'} • ${profile.climate || 'Nederland'}</p>
                    </div>
                </div>
                <button class="settings-button" onclick="window.openSettingsSection('profile')">
                    Profiel bewerken
                </button>
            </div>

            <!-- MENU SECTIES -->
            <div class="settings-section">
                <div class="settings-item" onclick="window.openSettingsSection('about')">
                    <i>🏷️</i>
                    <span>Over de app</span>
                </div>
                <div class="settings-item" onclick="window.openSettingsSection('storage')">
                    <i>💾</i>
                    <span>Data & Opslag</span>
                </div>
                <div class="settings-item" onclick="window.openSettingsSection('faq')">
                    <i>❓</i>
                    <span>Veelgestelde vragen</span>
                </div>
            </div>

            <!-- THEME SECTIE -->
            <div class="settings-section">
                <div class="settings-item">
                    <i id="theme-panel-icon">${isDark ? '🌙' : '☀️'}</i>
                    <span id="theme-panel-label">${isDark ? 'Donkere modus' : 'Lichte modus'}</span>
                    <div class="settings-toggle">
                        <label class="switch">
                            <input type="checkbox" ${isDark ? 'checked' : ''} onchange="window.toggleThemeFromPanel(this)">
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- WEERGAVE SECTIE (DESKTOP) -->
            <div class="settings-section hidden-mobile-settings" style="margin-top: 10px;">
                <p style="font-size: 11px; font-weight: 700; color: #fff; opacity: 0.4; margin: 0 0 8px 14px; text-transform: uppercase;">Werkruimte breedte</p>
                <div style="display: flex; gap: 8px; padding: 0 12px; margin-bottom: 12px;">
                    <button class="layout-toggle-btn ${localStorage.getItem('layout_width') !== 'wide' ? 'active' : ''}" 
                            onclick="window.toggleLayoutWidth('standard')" 
                            style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: ${localStorage.getItem('layout_width') !== 'wide' ? 'rgba(255,255,255,0.12)' : 'transparent'}; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;">
                        Standaard
                    </button>
                    <button class="layout-toggle-btn ${localStorage.getItem('layout_width') === 'wide' ? 'active' : ''}" 
                            onclick="window.toggleLayoutWidth('wide')" 
                            style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: ${localStorage.getItem('layout_width') === 'wide' ? 'rgba(255,255,255,0.12)' : 'transparent'}; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;">
                        Breed
                    </button>
                </div>
            </div>

            <style>
                @media (max-width: 800px) {
                    .hidden-mobile-settings { display: none !important; }
                }
            </style>

            <div class="settings-footer" style="padding: 20px 14px; opacity: 0.4; font-size: 12px; text-align: center;">
                Versie 1.3.2 🌱 KweekKompas
            </div>
            
        </div>
    `;
}

window.toggleThemeFromPanel = function(checkbox) {
    const icon = document.getElementById('theme-panel-icon');
    const label = document.getElementById('theme-panel-label');
    if (checkbox.checked) { 
        document.documentElement.setAttribute('data-theme', 'dark'); 
        localStorage.setItem('theme', 'dark'); 
        if(icon) icon.textContent = '🌙';
        if(label) label.textContent = 'Donkere modus';
    } 
    else { 
        document.documentElement.removeAttribute('data-theme'); 
        localStorage.setItem('theme', 'light'); 
        if(icon) icon.textContent = '☀️';
        if(label) label.textContent = 'Lichte modus';
    }
}

window.toggleLayoutWidth = function(type) {
    document.body.classList.remove('layout-standard', 'layout-full', 'layout-wide');
    document.body.classList.add('layout-' + type);
    localStorage.setItem('layout_width', type);
    renderSettingsPanel(); // Ververs om actieve staat te tonen
}

const tagCategories = {
    "Groei": ["Voorzaaien", "Direct zaaien", "Klimplant", "Snelle groeier"],
    "Levenscyclus": ["Eenjarig", "Tweejarig", "Vaste plant", "Winterhard"],
    "Gebruik": ["Eetbaar", "Kruidenplant", "Sierplant", "Snijbloem", "Droogbloem", "Potten", "Border"],
    "Ecosysteem": ["Bijvriendelijk", "Vlinderplant", "Insectwerend", "Companion plant"],
    "Moeilijkheid": ["Beginner", "Makkelijk", "Weinig onderhoud", "Gevoelig voor vorst", "Niet verplanten", "Lastige kiemer"]
};

const tagCategoryOrder = ["Groei", "Levenscyclus", "Gebruik", "Ecosysteem", "Moeilijkheid"];

const mockData = {
    "tomaat": { type: "Groente", zaaitijd: "Maart - April", oogsttijd: "Juli - Oktober", standplaats: "Kas", water: "Veel", tips: "Heel veel zon en warmte (Kas is perfect). Geef ruim water en dief wekelijks de okselscheuten. Vraagt veel voeding (vruchtgroente-mest).", tags: ["Voorzaaien", "Eenjarig", "Eetbaar", "Potten", "Snelle groeier"] },
    "paprika": { type: "Groente", zaaitijd: "Februari - Maart", oogsttijd: "Juli - Oktober", standplaats: "Kas", water: "Gemiddeld", tips: "Warmte en zon zijn cruciaal. Heeft veel water nodig maar absoluut geen natte voeten. Geef regelmatig voeding zodra bloemetjes verschijnen.", tags: ["Voorzaaien", "Eenjarig", "Eetbaar", "Potten", "Gevoelig voor vorst"] },
    "komkommer": { type: "Groente", zaaitijd: "April - Mei", oogsttijd: "Juli - September", standplaats: "Kas", water: "Veel", tips: "Warmteminner. Houdt van een hoge luchtvochtigheid. Zeer dorstig, geef dagelijks lauw water bij de voet (niet op het blad). Verwijder zijscheuten.", tags: ["Voorzaaien", "Klimplant", "Snelle groeier", "Eenjarig", "Eetbaar"] },
    "courgette": { type: "Groente", zaaitijd: "April - Mei", oogsttijd: "Juli - Oktober", standplaats: "Zon", water: "Veel", tips: "Bizarre groeier, vraagt veel ruimte. Geef dagelijks een grote slok water op de aarde (niet op het blad, i.v.m. meeldauw). Zorg voor zeer voedzame grond.", tags: ["Voorzaaien", "Snelle groeier", "Eetbaar", "Bijvriendelijk", "Eenjarig"] },
    "aubergine": { type: "Groente", zaaitijd: "Februari - Maart", oogsttijd: "Augustus - Oktober", standplaats: "Kas", water: "Gemiddeld", tips: "Zeer warmtebehoevend, het liefst in een kas. Giet altijd op aarde (niet op de plant). Top de plant als er 4-5 vruchten aanzitten.", tags: ["Voorzaaien", "Gevoelig voor vorst", "Eetbaar", "Potten", "Eenjarig"] },
    "peper": { type: "Groente", zaaitijd: "Januari - Maart", oogsttijd: "Augustus - Oktober", standplaats: "Kas", water: "Weinig", tips: "Pepertjes kiemen traag en heet! Vinden het vaak fijner iets droger te staan in goed doorlatende grond. Dat bevordert bovendien de pittigheid.", tags: ["Voorzaaien", "Eetbaar", "Potten", "Gevoelig voor vorst", "Eenjarig"] },
    "meloen": { type: "Fruit", zaaitijd: "April - Mei", oogsttijd: "Augustus - September", standplaats: "Kas", water: "Gemiddeld", tips: "Tropische wensen! Heeft de warmte van de kas nodig. Zijtakken die vrucht dragen knip je na 1 blad boven de vrucht af.", tags: ["Voorzaaien", "Klimplant", "Eetbaar", "Gevoelig voor vorst", "Snelle groeier"] },
    "sla": { type: "Groente", zaaitijd: "Maart - Augustus", oogsttijd: "Mei - Oktober", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Zon is prima, maar bij hitte schieten ze snel door of worden sappige bladen bitter. Geef water om de bladeren knapperig te houden.", tags: ["Direct zaaien", "Makkelijk", "Eetbaar", "Potten", "Snelle groeier"] },
    "zonnebloem": { type: "Bloem", zaaitijd: "April - Mei", oogsttijd: "Augustus - September", standplaats: "Zon", water: "Veel", tips: "De absolute grootgebruiker van water, warmte en zon. Snel and groot dus ideaal voor in de volle grond.", tags: ["Direct zaaien", "Eenjarig", "Sierplant", "Bijvriendelijk", "Vlinderplant", "Snelle groeier", "Potten", "Makkelijk"] },
    "radijs": { type: "Groente", zaaitijd: "Maart - Augustus", oogsttijd: "Mei - Oktober", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Groeit razendsnel. Houd de grond vochtig voor malse radijsjes; te droge grond maakt ze houterig en te scherp.", tags: ["Direct zaaien", "Makkelijk", "Eetbaar", "Snelle groeier", "Potten"] },
    "augurk": { type: "Groente", zaaitijd: "Mei - Juni", oogsttijd: "Juli - September", standplaats: "Zon", water: "Hoog", tips: "Houdt van warmte en veel vocht. Laat de plant bij voorkeur klimmen tegen gaas om ziektes en kromme vruchten te voorkomen.", tags: ["Voorzaaien", "Klimplant", "Hittebestendig", "Eetbaar"] },
    "wortel": { type: "Groente", zaaitijd: "Maart - Juli", oogsttijd: "Juni - November", standplaats: "Zon", water: "Gemiddeld", tips: "Zorg for een diep losgemaakte grond zonder stenen voor rechte wortels. Zaai dun uit of dun later uit om ruimte te geven.", tags: ["Direct zaaien", "Makkelijk", "Eetbaar", "Winterhard"] },
    "madeliefje": { type: "Bloem", zaaitijd: "Maart - Mei", oogsttijd: "Mei - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Madeliefjes zijn ijzersterk en bloeien bijna het hele jaar door. Ze zaaien zichzelf ook makkelijk uit in het gazon.", tags: ["Vaste plant", "Makkelijk", "Sierplant", "Eetbaar", "Bijvriendelijk"] },
    "lavendel": { type: "Struik", zaaitijd: "Maart - April", oogsttijd: "Juli - September", standplaats: "Zon", water: "Weinig", tips: "Zet op een zonnige plek in kalkrijke grond. Snoei twee keer per jaar om de plant compact te houden.", tags: ["Vaste plant", "Bijvriendelijk", "Sierplant", "Winterhard"] },
    "siergras": { type: "Sierplant", zaaitijd: "Maart - Mei", oogsttijd: "Geheel Jaar", standplaats: "Zon", water: "Gemiddeld", tips: "Knip in het vroege voorjaar (maart) de dode stengels terug tot 10cm boven de grond voor frisse nieuwe groei.", tags: ["Sierplant", "Winterhard", "Weinig onderhoud"] },
    "spinazie": { type: "Groente", zaaitijd: "Februari - September", oogsttijd: "April - November", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Groeit snel en houdt niet van te veel hitte. Zaai in het voorjaar en najaar voor de beste resultaten.", tags: ["Direct zaaien", "Makkelijk", "Eetbaar", "Snelle groeier"] },
    "boerenkool": { type: "Groente", zaaitijd: "Mei - Juli", oogsttijd: "Oktober - Februari", standplaats: "Zon", water: "Gemiddeld", tips: "Een echte wintergroente. Smaakt het lekkerst als de vorst eroverheen is gegaan.", tags: ["Direct zaaien", "Winterhard", "Eetbaar"] },
    "broccoli": { type: "Groente", zaaitijd: "Maart - Juni", oogsttijd: "Juni - September", standplaats: "Zon", water: "Gemiddeld", tips: "Heeft veel voeding nodig. Oogst de hoofdscherm op tijd om zijscheuten te stimuleren.", tags: ["Voorzaaien", "Eetbaar"] },
    "bloemkool": { type: "Groente", zaaitijd: "Februari - Juli", oogsttijd: "Juni - Oktober", standplaats: "Zon", water: "Hoog", tips: "Vraagt constante vochtigheid en veel voeding. Dek de kool af met eigen blad tegen verkleuring.", tags: ["Voorzaaien", "Eetbaar"] },
    "prei": { type: "Groente", zaaitijd: "Maart - Mei", oogsttijd: "September - April", standplaats: "Zon", water: "Gemiddeld", tips: "Plant diep in een geul voor een lange witte schacht. Kan goed tegen vorst.", tags: ["Voorzaaien", "Winterhard", "Eetbaar"] },
    "ui": { type: "Groente", zaaitijd: "Maart - April", oogsttijd: "Augustus - September", standplaats: "Zon", water: "Laag", tips: "Houdt van goed doorlatende grond. Oogst als het loof gaat liggen en laat goed drogen.", tags: ["Direct zaaien", "Eetbaar"] },
    "knoflook": { type: "Groente", zaaitijd: "September - November", oogsttijd: "Juni - Juli", standplaats: "Zon", water: "Laag", tips: "Plant in het najaar voor de beste ontwikkeling van de bollen. Heeft een koudeperiode nodig.", tags: ["Direct zaaien", "Winterhard", "Eetbaar"] },
    "peterselie": { type: "Kruid", zaaitijd: "Maart - Juli", oogsttijd: "Juni - November", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Kiemt traag. Houd de grond goed vochtig tijdens het kiemen.", tags: ["Direct zaaien", "Eetbaar", "Potten"] },
    "bieslook": { type: "Kruid", zaaitijd: "Maart - Augustus", oogsttijd: "Mei - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Vaste plant die elk jaar terugkomt. Knip regelmatig om nieuwe groei te stimuleren.", tags: ["Vaste plant", "Eetbaar", "Bijvriendelijk"] },
    "munt": { type: "Kruid", zaaitijd: "Maart - Mei", oogsttijd: "Mei - Oktober", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Woekert enorm, dus plant bij voorkeur in een pot.", tags: ["Vaste plant", "Eetbaar", "Potten"] },
    "rozemarijn": { type: "Kruid", zaaitijd: "Maart - Mei", oogsttijd: "Geheel Jaar", standplaats: "Zon", water: "Laag", tips: "Houdt van kalkrijke, droge grond. Snoei licht na de bloei.", tags: ["Vaste plant", "Winterhard", "Bijvriendelijk"] },
    "tijm": { type: "Kruid", zaaitijd: "Maart - Mei", oogsttijd: "Geheel Jaar", standplaats: "Zon", water: "Laag", tips: "Zet op een zonnige, droge plek. Perfect voor rotstuinen of potten.", tags: ["Vaste plant", "Winterhard", "Bijvriendelijk"] },
    "salie": { type: "Kruid", zaaitijd: "Maart - Mei", oogsttijd: "Geheel Jaar", standplaats: "Zon", water: "Laag", tips: "Heeft zilverachtig blad en prachtige bloemen. Houdt van zon en droogte.", tags: ["Vaste plant", "Winterhard", "Bijvriendelijk"] },
    "aardbei": { type: "Fruit", zaaitijd: "Maart - April", oogsttijd: "Juni - Juli", standplaats: "Zon", water: "Gemiddeld", tips: "Vaste plant die uitlopers maakt. Geef stro onder de vruchten tegen rot.", tags: ["Vaste plant", "Eetbaar", "Potten"] },
    "framboos": { type: "Fruit", zaaitijd: "Oktober - Maart", oogsttijd: "Juli - September", standplaats: "Zon", water: "Gemiddeld", tips: "Snoei zomerframbozen na de oogst tot de grond terug.", tags: ["Vaste plant", "Winterhard", "Eetbaar"] },
    "blauwe bes": { type: "Fruit", zaaitijd: "Oktober - Maart", oogsttijd: "Juli - Augustus", standplaats: "Zon", water: "Gemiddeld", tips: "Houdt van zure grond. Gebruik tuinturf bij het planten.", tags: ["Vaste plant", "Winterhard", "Eetbaar"] },
    "goudsbloem": { type: "Bloem", zaaitijd: "Maart - Juni", oogsttijd: "Juni - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Makkelijke plant die zichzelf uitzaait. De bloemblaadjes zijn eetbaar.", tags: ["Eenjarig", "Eetbaar", "Bijvriendelijk", "Makkelijk"] },
    "oost-indische kers": { type: "Bloem", zaaitijd: "April - Juni", oogsttijd: "Juni - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Bloemen en bladeren zijn eetbaar en hebben een peperige smaak. Houdt bladluis weg.", tags: ["Eenjarig", "Eetbaar", "Snelle groeier", "Klimplant"] },
    "lavatera": { type: "Bloem", zaaitijd: "Maart - Mei", oogsttijd: "Juli - September", standplaats: "Zon", water: "Gemiddeld", tips: "Bloeit zeer rijk met grote roze of witte bloemen. Houdt van voedzame grond.", tags: ["Eenjarig", "Bijvriendelijk", "Sierplant"] },
    "lathyrus": { type: "Bloem", zaaitijd: "Maart - Mei", oogsttijd: "Juni - September", standplaats: "Zon", water: "Gemiddeld", tips: "Heerlijk geurende klimplant. Hoe meer je plukt, hoe meer hij bloeit.", tags: ["Eenjarig", "Klimplant", "Aromatisch"] },
    "cosmea": { type: "Bloem", zaaitijd: "April - Mei", oogsttijd: "Juli - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Elegante plant met fijn blad. Bloeit tot de eerste vorst.", tags: ["Eenjarig", "Bijvriendelijk", "Sierplant"] },
    "tagetes": { type: "Bloem", zaaitijd: "Maart - Mei", oogsttijd: "Juni - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Ook wel afrikaantjes genoemd. Helpt aaltjes in de grond te bestrijden.", tags: ["Eenjarig", "Bijvriendelijk", "Companion plant"] },
    "dahlias": { type: "Bloem", zaaitijd: "April - Mei", oogsttijd: "Juli - November", standplaats: "Zon", water: "Veel", tips: "Haal de knollen voor de vorst uit de grond. Bloeit fantastisch tot diep in de herfst.", tags: ["Vaste plant", "Sierplant", "Snijbloem"] }
};

// --- INDEXED DB WRAPPER ---
const DB_NAME = 'MoestuinDB';
const STORE_NAME = 'seeds';
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

function getAllSeeds() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
            seeds = req.result.sort((a, b) => Number(b.id) - Number(a.id));
            resolve(seeds);
        };
        req.onerror = () => reject(req.error);
    });
}

function saveSeed(seed) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(seed);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function deleteSeedDB(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}


document.addEventListener('DOMContentLoaded', async () => {
    try { await initDB(); } catch (err) { console.error("DB Init failed", err); }

    // --- USER PROFILE & ONBOARDING ---
    window.updateProfileUI = function() {
        const nameRow = document.getElementById('display-profile-name-row');
        const nameDisplay = document.getElementById('display-profile-name');
        const climateDisplay = document.getElementById('display-profile-climate');
        const unitsDisplay = document.getElementById('display-profile-units');

        const profile = window.userProfile;
        if (profile.name) {
            if (nameRow) nameRow.classList.remove('hidden');
            if (nameDisplay) nameDisplay.textContent = profile.name;
        } else {
            if (nameRow) nameRow.classList.add('hidden');
        }

        if (climateDisplay) climateDisplay.textContent = profile.climate;
        if (unitsDisplay) unitsDisplay.textContent = profile.units === 'Metric' ? 'Metric (cm/°C)' : 'Imperial (in/°F)';
    }
    window.updateProfileUI();

    let onboardingData = { light: '', type: '', level: '' };

    async function finishOnboarding() {
        userProfile.light = onboardingData.light || '';
        userProfile.level = onboardingData.level || '';
        localStorage.setItem('moestuin_user_profile', JSON.stringify(userProfile));
        updateProfileUI();
        
        localStorage.setItem('onboarding_done', 'true');
        const starters = [
            { 
                id: Date.now() + 1, 
                naam: "Cherry Tomaat 'Sweet Million'", 
                type: "Groente", 
                standplaats: onboardingData.light || 'Zon', 
                zaaitijd: "Maart - April (Binnen)", 
                oogsttijd: "Juli - September", 
                status: "Voorraad", 
                tags: ["Zoet", "Productief", "Starter"], 
                image: "assets/starters/tomaat.png",
                isFavorite: true 
            },
            { 
                id: Date.now() + 2, 
                naam: "Radijs 'Cherry Belle'", 
                type: "Groente", 
                standplaats: onboardingData.light || 'Halfschaduw', 
                zaaitijd: "Maart - Augustus", 
                oogsttijd: "April - September", 
                status: "Voorraad", 
                tags: ["Snel", "Krokant", "Makkelijk"], 
                image: "assets/starters/radijs.png"
            },
            { 
                id: Date.now() + 3, 
                naam: "Courgette 'Black Beauty'", 
                type: "Groente", 
                standplaats: "Zon", 
                zaaitijd: "Mei - Juni", 
                oogsttijd: "Juli - September", 
                status: "Voorraad", 
                tags: ["Groot", "Rijke oogst", "Populair"], 
                image: "assets/starters/courgette.png"
            },
            { 
                id: Date.now() + 4, 
                naam: "Pluksla 'Gemengd'", 
                type: "Groente", 
                standplaats: "Halfschaduw", 
                zaaitijd: "Maart - Augustus", 
                oogsttijd: "Mei - Oktober", 
                status: "Voorraad", 
                tags: ["Gezond", "Snel", "Vers"], 
                image: "assets/starters/sla.png"
            },
            { 
                id: Date.now() + 5, 
                naam: "Basilicum 'Genovese'", 
                type: "Kruid", 
                standplaats: "Zon", 
                zaaitijd: "Mei - Juli", 
                oogsttijd: "Juli - September", 
                status: "Voorraad", 
                tags: ["Aromatisch", "Keuken", "Pot"], 
                image: "assets/starters/basilicum.png"
            },
            { 
                id: Date.now() + 6, 
                naam: "Regenboog Snijbiet", 
                type: "Groente", 
                standplaats: "Halfschaduw", 
                zaaitijd: "Maart - Augustus", 
                oogsttijd: "Juni - November", 
                status: "Voorraad", 
                tags: ["Kleurrijk", "Vitamines", "Makkelijk"], 
                image: "assets/starters/snijbiet.png"
            }
        ];
        // Only add if not already present by name
        const existingSeeds = await getAllSeeds();
        for (let s of starters) { 
            const exists = existingSeeds.some(es => es.naam.toLowerCase() === s.naam.toLowerCase());
            if (!exists) {
                await saveSeed(s); 
            }
        }
        seeds = await getAllSeeds();
        renderHome();
        switchView('home');
        showToast("Je tuin is klaar 🌱");
    }

    // Attach Onboarding Listeners early
    document.querySelectorAll('.onboarding-next').forEach(btn => {
        btn.addEventListener('click', () => {
            const next = btn.dataset.next;
            document.querySelectorAll('.onboarding-step').forEach(s => s.classList.add('hidden'));
            const nextStep = document.getElementById(`onboarding-step-${next}`);
            if (nextStep) nextStep.classList.remove('hidden');
        });
    });

    document.querySelectorAll('.onboarding-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            const step = btn.closest('.onboarding-step');
            if (!step) return;
            const val = btn.dataset.val;
            if (step.id === 'onboarding-step-2') {
                onboardingData.light = val;
                localStorage.setItem('onboarding_sun', val);
            }
            if (step.id === 'onboarding-step-3') {
                onboardingData.type = val;
                localStorage.setItem('onboarding_type', val);
            }
            if (step.id === 'onboarding-step-4') {
                onboardingData.level = val;
                localStorage.setItem('onboarding_level', val);
            }

            const nextId = parseInt(step.id.split('-').pop()) + 1;
            step.classList.add('hidden');
            if (nextId <= 4) {
                document.getElementById(`onboarding-step-${nextId}`)?.classList.remove('hidden');
            } else {
                document.getElementById('onboarding-finish')?.classList.remove('hidden');
            }
        });
    });

    document.querySelectorAll('.onboarding-skip').forEach(btn => {
        btn.addEventListener('click', () => {
            localStorage.setItem('onboarding_done', 'true');
            switchView('home');
        });
    });

    const btnFinishOnboarding = document.getElementById('btn-onboarding-finish');
    if (btnFinishOnboarding) btnFinishOnboarding.onclick = finishOnboarding;

    // Expose switchView immediately so it works for early clicks
    window.switchView = switchView;

    seeds = await getAllSeeds();
    let reminders = JSON.parse(localStorage.getItem('moestuin_reminders')) || [];
    let dailyProgress = JSON.parse(localStorage.getItem('daily_progress')) || { date: '', count: 0 };
    let curCalDate = new Date();
    let selectedDateStr = null;

    const todayStr = new Date().toISOString().split('T')[0];
    if (dailyProgress.date !== todayStr) {
        dailyProgress = { date: todayStr, count: 0 };
        localStorage.setItem('daily_progress', JSON.stringify(dailyProgress));
    }


    const btnReset = document.getElementById('btn-factory-reset');
    if (btnReset) {
        btnReset.onclick = async () => {
            if (confirm("Weet je het zeker? Al je zaden en instellingen worden gewist.")) {
                localStorage.clear();
                // Sluit de connectie eerst, anders kan de DB niet verwijderd worden
                if (db) db.close(); 
                
                const req = indexedDB.deleteDatabase('MoestuinDB');
                req.onsuccess = () => {
                    location.reload();
                };
                req.onblocked = () => {
                    // Als er nog andere tabbladen open staan kan dit gebeuren
                    alert("Sluit a.u.b. andere KweekKompas schermen en probeer opnieuw.");
                };
                req.onerror = () => {
                    alert("Fout bij wissen database. Probeer de pagina te verversen.");
                };
            }
        };
    }


    function updateProgressUI() {
        const el = document.getElementById('daily-progress-hint');
        if (!el) return;
        if (dailyProgress.count > 0) {
            el.textContent = `${dailyProgress.count} ${dailyProgress.count === 1 ? 'actie' : 'acties'} voltooid vandaag 🌱`;
            el.style.display = 'block';
            el.classList.add('pulse-subtle');
            setTimeout(() => el.classList.remove('pulse-subtle'), 1000);
        } else {
            el.style.display = 'none';
        }
    }

    function incrementDailyProgress() {
        dailyProgress.count++;
        localStorage.setItem('daily_progress', JSON.stringify(dailyProgress));
        updateProgressUI();
    }

    const saveReminders = () => {
        localStorage.setItem('moestuin_reminders', JSON.stringify(reminders));
    };

    const addQuickReminder = (seed, customDate = null) => {
        const today = new Date();
        const dateToUse = customDate || today;
        const dateStr = dateToUse.toISOString().split('T')[0];
        const title = `${seed.naam} zaaien`;
        
        const isDuplicateDay = reminders.some(r => r.title.toLowerCase().includes(seed.naam.toLowerCase()) && r.date === dateStr);
        
        if (isDuplicateDay) {
            showToast(`Staat al in je kalender op deze dag. 📅`);
            return;
        }
        
        const newReminder = {
            id: Date.now(),
            date: dateStr,
            title: title,
            done: false
        };
        
        reminders.push(newReminder);
        saveReminders();
        incrementDailyProgress();
        showToast(`Reminder toegevoegd voor ${dateStr.split('-').reverse().slice(0,2).join('-')}: ${title} 📅`);
    };

    // MIGRATIONS
    let migrationNeeded = false;
    const currentYear = new Date().getFullYear();

    for (let s of seeds) {
        let changed = false;
        if (!s.tags || s.tags.length === 0) {
            const queryLower = s.naam.toLowerCase();
            for (let key in mockData) {
                if (queryLower.includes(key) || key.includes(queryLower)) {
                    s.tags = mockData[key].tags || [];
                    changed = true;
                    break;
                }
            }
        }
        if (!s.status) {
            s.status = (s.lastSownYear === currentYear) ? 'Gezaaid' : 'Voorraad';
            changed = true;
        }

        // Initialize flags based on status if missing
        if (s.fase_gezaaid === undefined) { s.fase_gezaaid = (s.status === 'Gezaaid' || s.status === 'Groeit' || s.status === 'Geoogst'); changed = true; }
        if (s.fase_groeit === undefined) { s.fase_groeit = (s.status === 'Groeit'); changed = true; }
        if (s.fase_geoogst === undefined) { s.fase_geoogst = (s.status === 'Geoogst'); changed = true; }

        if (s.isFavorite === undefined) {
            s.isFavorite = false;
            changed = true;
        }


        if (changed) {
            await saveSeed(s);
            migrationNeeded = true;
        }

        // --- SEASONAL RESET (New System) ---
        if (s.lastSownYear && s.lastSownYear < currentYear && s.status !== 'Voorraad') {
            // Determine if plant is perennial based on tags or isPerennial flag
            const isPerennial = (s.tags || []).some(t =>
                t.toLowerCase().includes('vaste plant') ||
                t.toLowerCase().includes('winterhard') ||
                t.toLowerCase().includes('perennial')
            ) || s.isPerennial === true;

            if (!isPerennial) {
                s.status = 'Voorraad';
                await saveSeed(s);
                migrationNeeded = true;
            }
        }

        // --- CATEGORY MAPPING (New System) ---
        if (s.type === 'Plant') {
            s.type = 'Sierplant';
            await saveSeed(s);
            migrationNeeded = true;
        }
        if (s.type === 'Gras') {
            s.type = 'Sierplant';
            await saveSeed(s);
            migrationNeeded = true;
        }
    }
    if (migrationNeeded) seeds = await getAllSeeds();

    let pendingImages = [];
    let photoSearchResults = []; // Local cache of search results (not necessarily selected)
    let displayedPhotoCount = 6; // How many web results to show initially
    let editingId = null;
    let activeCategory = 'Alles';
    let activeMonthFilter = null; // null or 0-11
    let showAllMissed = false;

    // --- LIGHTBOX LOGIC ---
    let currentLightboxIdx = 0;
    let currentLightboxImages = [];

    function openLightbox(images, idx) {
        currentLightboxImages = images;
        currentLightboxIdx = idx;
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        if (lb && img && currentLightboxImages[idx]) {
            img.src = currentLightboxImages[idx].url || currentLightboxImages[idx];
            lb.classList.remove('hidden');
        }
    }
    window.openLightbox = openLightbox;

    // --- CALENDAR STATE ---
    let calendarFilters = { sow: true, grow: true, harvest: true };
    document.querySelectorAll('.cal-filter-btn').forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type;
            calendarFilters[type] = !calendarFilters[type];
            btn.classList.toggle('active', calendarFilters[type]);
            renderCalendar();
        };
    });

    function closeLightbox() {
        document.getElementById('lightbox')?.classList.add('hidden');
    }
    window.closeLightbox = closeLightbox;

    function nextLightboxImage() {
        if (currentLightboxImages.length === 0) return;
        currentLightboxIdx = (currentLightboxIdx + 1) % currentLightboxImages.length;
        const img = document.getElementById('lightbox-img');
        if (img) img.src = currentLightboxImages[currentLightboxIdx].url || currentLightboxImages[currentLightboxIdx];
    }
    window.nextLightboxImage = nextLightboxImage;

    function prevLightboxImage() {
        if (currentLightboxImages.length === 0) return;
        currentLightboxIdx = (currentLightboxIdx - 1 + currentLightboxImages.length) % currentLightboxImages.length;
        const img = document.getElementById('lightbox-img');
        if (img) img.src = currentLightboxImages[currentLightboxIdx].url || currentLightboxImages[currentLightboxIdx];
    }
    window.prevLightboxImage = prevLightboxImage;

    // Attach Lightbox Events
    document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
    document.getElementById('lightbox-next')?.addEventListener('click', nextLightboxImage);
    document.getElementById('lightbox-prev')?.addEventListener('click', prevLightboxImage);
    document.getElementById('lightbox')?.addEventListener('click', (e) => {
        if (e.target.id === 'lightbox') closeLightbox();
    });

    // --- CATEGORY FILTER LISTENERS ---
    const filterChips = document.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const filterValue = chip.dataset.filter;

            if (filterValue === 'Alles') {
                activeCategory = 'Alles';
                activeMonthFilter = null;
                localStorage.removeItem('activeMonthFilter');
                if (window.clearMonthFilter) window.clearMonthFilter(); // Ensure banner is hidden
                filterChips.forEach(c => {
                    const v = c.dataset.filter;
                    c.classList.toggle('active', v === 'Alles');
                });
            } else {
                activeCategory = filterValue;
                filterChips.forEach(c => {
                    const v = c.dataset.filter;
                    c.classList.toggle('active', v === activeCategory);
                });
            }
            applyFilters();
        });
    });

    // --- INFO PROPOSAL LOGIC (Refined) ---
    const btnAutoFill = document.getElementById('btn-auto-fill-info');
    const btnResetAi = document.getElementById('btn-reset-ai-fields');
    const banner = document.getElementById('suggestion-banner');

    function clearAiIndicators() {
        document.querySelectorAll('.ai-badge').forEach(b => b.remove());
    }

    function addAiIndicatorToLabel(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        // Find label (either for=ID or parent)
        let label = document.querySelector(`label[for="${inputId}"]`);
        if (!label) {
            const group = input.closest('.form-group');
            if (group) label = group.querySelector('label');
        }

        if (label && !label.querySelector('.ai-badge')) {
            const badge = document.createElement('span');
            badge.className = 'ai-badge';
            badge.textContent = '✨';
            label.appendChild(badge);
        }
    }

    const triggerAutoFill = async (force = false) => {
        const naamRaw = inputNaam.value.trim();
        if (!naamRaw) {
            showToast("Vul eerst een naam in om info aan te vullen! ✍️");
            return;
        }

        const sourceStatusEl = document.getElementById('ai-source-status');
        const setSourceStatus = (text, type = 'info') => {
            if (!sourceStatusEl) return;
            sourceStatusEl.textContent = text;
            sourceStatusEl.className = 'ai-source-status visible ' + type;
            if (type === 'hidden') sourceStatusEl.className = 'ai-source-status hidden';
        };

        const hideBanner = () => { if (banner) banner.classList.add('hidden'); };

        const btn = force ? btnResetAi : btnAutoFill;
        if (btn) {
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.innerHTML = `✨ Even nadenken...`;
        }

        try {
            const query = naamRaw.toLowerCase();
            let foundMatch = null;
            let matchKey = '';
            let source = '';

            // 1. Try local mockData first (fast) - Exact or Start match only to prevent "Sla" matching "Augurk"
            for (let key in mockData) {
                const k = key.toLowerCase();
                if (query === k || query.startsWith(k + " ") || k.startsWith(query)) {
                    foundMatch = { ...mockData[key] };
                    matchKey = key;
                    source = 'Eigen data';
                    break;
                }
            }

            // 2. Try localStorage cache (for previous AI results)
            const cacheKey = 'ai_cache_' + naamRaw.toLowerCase().trim();
            if (!foundMatch && !force) {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        foundMatch = JSON.parse(cached);
                        source = 'Gecachte data';
                        matchKey = naamRaw;
                    } catch(e) { 
                        console.warn("Corrupt AI cache rejected");
                        localStorage.removeItem(cacheKey);
                    }
                }
            }

            // 3. AI Fallback if no match (either mock or cache) or forced refresh
            if (!foundMatch || force) {
                if (!foundMatch) matchKey = naamRaw;

                const monthsNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
                const currentMonthNamesNames = monthsNames[new Date().getMonth()];

                try {
                    const aiRes = await vraagAI('fill_seed_info', naamRaw, currentMonthNamesNames);
                    const jsonStr = aiRes.match(/\{[\s\S]*\}/)?.[0];
                    if (jsonStr) {
                        const aiData = JSON.parse(jsonStr);
                        // Merge with local if it existed but we forced AI
                        foundMatch = { ...(foundMatch || {}), ...aiData };
                        source = 'AI-voorstel – controleer even';
                        // Save to cache for next time
                        localStorage.setItem(cacheKey, JSON.stringify(foundMatch));
                    }
                } catch (aiErr) {
                    console.error("AI Fallback failed:", aiErr);
                    if (foundMatch && !source) source = 'Eigen data (AI fout)';
                }
            }

            if (foundMatch) {
                clearAiIndicators();
                let fieldsUpdated = 0;

                // Help mappings
                const standplaatsMap = { 'volle zon': 'Zon', 'veel zon': 'Zon', 'zonnig': 'Zon', 'zon': 'Zon', 'half': 'Halfschaduw', 'deels': 'Halfschaduw', 'schaduw': 'Schaduw', 'kas': 'Kas' };
                const waterMap = { 'weinig': 'Laag', 'laag': 'Laag', 'gemiddeld': 'Gemiddeld', 'normaal': 'Gemiddeld', 'veel': 'Hoog', 'hoog': 'Hoog' };
                const typeMap = { 'groente': 'Groente', 'fruit': 'Fruit', 'kruid': 'Kruid', 'bloem': 'Bloem', 'bol': 'Bloembol', 'boom': 'Boom', 'struik': 'Struik', 'sier': 'Sierplant' };

                const mapVal = (val, mapping) => {
                    if (!val) return null;
                    const lower = val.toString().toLowerCase();
                    for (const [key, target] of Object.entries(mapping)) {
                        if (lower.includes(key)) return target;
                    }
                    return null;
                };

                // 1. Type (Dropdown)
                if (inputType && (force || inputType.dataset.userChanged !== 'true')) {
                    const matched = mapVal(foundMatch.type, typeMap);
                    if (matched && (force || inputType.value !== matched)) {
                        inputType.value = matched;
                        addAiIndicatorToLabel('type');
                        fieldsUpdated++;
                    }
                }

                // 2. Standplaats (Dropdown)
                if (inputStandplaats && (force || inputStandplaats.dataset.userChanged !== 'true')) {
                    const matched = mapVal(foundMatch.standplaats, standplaatsMap);
                    if (matched && (force || inputStandplaats.value !== matched)) {
                        inputStandplaats.value = matched;
                        addAiIndicatorToLabel('standplaats');
                        fieldsUpdated++;
                    }
                }

                // 3. Waterbehoefte (Dropdown)
                if (inputWater && (force || inputWater.dataset.userChanged !== 'true')) {
                    const matched = mapVal(foundMatch.waterbehoefte || foundMatch.water, waterMap);
                    if (matched && (force || inputWater.value !== matched)) {
                        inputWater.value = matched;
                        addAiIndicatorToLabel('water');
                        fieldsUpdated++;
                    }
                }

                // 4. Teeltinformatie (Textarea)
                if (inputBeschrijving && (force || (!inputBeschrijving.value.trim() && inputBeschrijving.dataset.userChanged !== 'true'))) {
                    // Be more flexible with keys returned by AI - many fallbacks for different AI models
                    let rawTips = foundMatch.teeltinformatie || foundMatch.teeltinfo || foundMatch.teelt || 
                                  foundMatch.tips || foundMatch.tip || foundMatch.info || 
                                  foundMatch.omschrijving || foundMatch.beschrijving || 
                                  foundMatch.cultivation || foundMatch.planting_info || '';
                    if (rawTips) {
                        // Cleanup: remove common labels and excessive whitespace
                        let cleanTips = rawTips.toString()
                            .replace(/^(Teeltinformatie|Teeltinfo|Tip|Advies|Omschrijving|Beschrijving):\s*/i, '')
                            .trim();
                        
                        // If it's very long, still truncate to a reasonable 2-3 sentences max to keep it clean
                        const sentences = cleanTips.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 2);
                        if (sentences.length > 3) {
                            cleanTips = sentences.slice(0, 3).join('. ') + '.';
                        }
                        
                        if (force || inputBeschrijving.value !== cleanTips) {
                            inputBeschrijving.value = cleanTips;
                            addAiIndicatorToLabel('beschrijving');
                            fieldsUpdated++;
                        }
                    }
                }

                // 5. Zaaitijd (Picker)
                const currentZaai = getSelectedMonthsFromPicker('zaaitijd-picker');
                if (foundMatch.zaaitijd && (force || !currentZaai)) {
                    setSelectedMonthsInPicker('zaaitijd-picker', foundMatch.zaaitijd);
                    addAiIndicatorToLabel('zaaitijd-picker');
                    fieldsUpdated++;
                }

                // 6. Oogsttijd (Picker)
                const currentOogst = getSelectedMonthsFromPicker('oogsttijd-picker');
                if (foundMatch.oogsttijd && (force || !currentOogst)) {
                    setSelectedMonthsInPicker('oogsttijd-picker', foundMatch.oogsttijd);
                    addAiIndicatorToLabel('oogsttijd-picker');
                    fieldsUpdated++;
                }

                // 7. Tags (Merge instead of replace)
                if (foundMatch.tags && Array.isArray(foundMatch.tags)) {
                    const currentTags = Array.from(document.querySelectorAll('.tag-picker-chip.active')).map(c => c.dataset.tag.toLowerCase());
                    // Split any tags that might contain commas from the AI, then trim and flatten
                    const newTagsParsed = foundMatch.tags.flatMap(t => t.split(',').map(s => s.trim().toLowerCase())).filter(t => t.length > 0);
                    const mergedTags = [...new Set([...currentTags, ...newTagsParsed])];
                    renderTagPicker(mergedTags);
                }

                setSourceStatus(source, 'success');

                if (banner) {
                    banner.classList.remove('hidden');
                    banner.querySelector('span').textContent = `🪄 Voorstel voor "${matchKey}" toegepast.`;
                }
                showToast(fieldsUpdated > 0 ? "Info aangevuld! ✨" : "Bestaande velden behouden. ✨");
            } else {
                hideBanner();
                setSourceStatus("Geen voorstel beschikbaar voor deze plant.", 'info');
                // No toast for no results, just the status line is enough
            }
        } catch (err) {
            console.error("AutoFill Error:", err);
            hideBanner();
            setSourceStatus("AI tijdelijk niet beschikbaar. Vul handmatig aan.", 'error');
            showToast("AI tijdelijk niet beschikbaar.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.innerHTML = force ? "🔄 Opnieuw" : "✨ Vul info aan";
            }
        }
    };

    if (btnAutoFill) {
        btnAutoFill.innerHTML = `Vul info aan ✨`;
        btnAutoFill.onclick = () => triggerAutoFill(false);
    }
    if (btnResetAi) {
        btnResetAi.onclick = () => triggerAutoFill(true);
    }
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const storedTheme = localStorage.getItem('theme') || 'dark';
    if (storedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (btnThemeToggle) btnThemeToggle.textContent = '\u2600\uFE0F';
    }
    
    // Layout Width Init
    const storedLayout = localStorage.getItem('layout_width') || 'standard';
    document.body.classList.add('layout-' + storedLayout);
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            const theme = document.documentElement.getAttribute('data-theme');
            if (theme === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                btnThemeToggle.textContent = '\uD83C\uDF19';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                btnThemeToggle.textContent = '\u2600\uFE0F';
            }
        });
    }

    // Collapsible state is now handled within the toggle initialization below

    // Helpers
    const monthNamesShort = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
    const calMonthNames = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];

    function initMonthPicker(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        monthNamesShort.forEach((name, i) => {
            const item = document.createElement('div');
            item.className = 'month-picker-item';
            item.textContent = name;
            item.dataset.monthIndex = i;
            item.addEventListener('click', () => item.classList.toggle('active'));
            container.appendChild(item);
        });
    }

    function getSelectedMonthsFromPicker(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return '';
        return [...container.querySelectorAll('.month-picker-item.active')].map(item => item.textContent).join(', ');
    }

    function setSelectedMonthsInPicker(containerId, valueString) {
        const activeIndices = getActiveMonths(valueString);
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.month-picker-item').forEach(item => {
            const idx = parseInt(item.dataset.monthIndex);
            item.classList.toggle('active', activeIndices.has(idx));
        });
    }

    function renderStars(value, interactive = false) {
        let numericValue = (typeof value === 'number') ? value : (parseInt(value) || 0);
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            const starChar = i <= numericValue ? '\u2605' : '\u2606';
            starsHTML += `<span class="star-item ${i <= numericValue ? 'active' : ''}" data-star="${i}">${starChar}</span>`;
        }
        return `<div class="star-rating ${interactive ? 'interactive' : ''}">${starsHTML}</div>`;
    }

    function initStarPicker() {
        const container = document.getElementById('star-rating-picker');
        if (!container) return;
        container.dataset.value = container.dataset.value || 0;
        container.innerHTML = renderStars(parseInt(container.dataset.value), true);
        initStarPickerEvents(container);
    }

    function initStarPickerEvents(container) {
        container.querySelectorAll('.star-item').forEach(star => {
            star.addEventListener('click', (e) => {
                const val = parseInt(e.target.dataset.star);
                container.dataset.value = val;
                container.innerHTML = renderStars(val, true);
                initStarPickerEvents(container);
            });
        });
    }

    // Elements
    const btnHome = document.getElementById('btn-home');
    const btnList = document.getElementById('btn-list');
    const btnSowingGrid = document.getElementById('btn-sowing-grid');
    const btnAdd = document.getElementById('btnAdd') || document.getElementById('btn-add');
    const btnWishlist = document.getElementById('btn-wishlist');
    const btnCalendar = document.getElementById('btn-calendar');
    const viewHome = document.getElementById('view-home');
    const viewList = document.getElementById('view-list');
    const viewSowingGrid = document.getElementById('view-sowing-grid');
    const viewAdd = document.getElementById('view-add');
    const viewDetail = document.getElementById('view-detail');
    const viewWishlist = document.getElementById('view-wishlist');
    const viewCalendar = document.getElementById('view-calendar');
    const viewOnboarding = document.getElementById('view-onboarding');
    const seedGrid = document.getElementById('seed-grid');
    const seedForm = document.getElementById('seed-form');
    const searchInput = document.getElementById('search-input');
    const detailBody = document.getElementById('detail-page-body');
    const toastContainer = document.getElementById('toast-container');
    const galleryPreview = document.getElementById('image-gallery-preview');

    const inputNaam = document.getElementById('naam');
    const inputType = document.getElementById('type');
    const inputStandplaats = document.getElementById('standplaats');
    const inputWater = document.getElementById('water');
    const inputStatus = document.getElementById('status');
    const inputBeschrijving = document.getElementById('beschrijving');
    const inputErvaringen = document.getElementById('ervaringen');
    const btnSubmitForm = document.getElementById('btn-submit-form');
    const btnDetailEdit = document.getElementById('btn-detail-edit');
    const btnDetailBack = document.getElementById('btn-detail-back');
    const btnDetailDelete = document.getElementById('btn-detail-delete');
    const btnQuickPhoto = document.getElementById('btn-quick-photo-search');
    if (inputNaam && btnQuickPhoto) {
        btnQuickPhoto.onclick = () => {
            const naam = inputNaam.value.trim();
            const pexelsInput = document.getElementById('pexels-search-input');
            const pexelsBtn = document.getElementById('btn-search-pexels-unified');
            if (pexelsInput && pexelsBtn) {
                pexelsInput.value = naam;
                pexelsBtn.click();
            }
        };

        // NEW: Handle Enter key in name field - Search photos & fill info instead of submitting form!
        inputNaam.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Stop form submit
                btnQuickPhoto.click(); // Trigger photo search
                
                // ALSO trigger AI info fill automatically if empty
                if (window._autoFillSeedInfo) {
                    window._autoFillSeedInfo(false); 
                }
            }
        });
    }

    let nuDoenExpandedGroups = { missed: false, now: false, soon: false };

    let lastToast = { message: '', time: 0 };
    function showToast(message) {
        if (!message) return;
        
        // Anti-spam: max 1 toast
        const container = document.getElementById('toast-container');
        if (container) {
            Array.from(container.children).forEach(c => c.remove());
        }

        const toast = document.createElement('div');
        toast.className = 'toast show';
        toast.innerHTML = `<span>${message}</span>`;
        if (container) container.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }



    // --- CLEAR INDICATORS ON MANUAL EDIT ---
    [inputNaam, inputType, inputStandplaats, inputWater, inputBeschrijving].forEach(inp => {
        if (inp) {
            inp.addEventListener('input', () => {
                const group = inp.closest('.form-group');
                if (group) {
                    const badge = group.querySelector('.ai-badge');
                    if (badge) badge.remove();
                }
                if (inp.id === 'standplaats' || inp.id === 'water' || inp.id === 'type') {
                    inp.dataset.userChanged = 'true';
                }
            });
            inp.addEventListener('change', () => {
                const group = inp.closest('.form-group');
                if (group) {
                    const badge = group.querySelector('.ai-badge');
                    if (badge) badge.remove();
                }
                if (inp.id === 'standplaats' || inp.id === 'water' || inp.id === 'type') {
                    inp.dataset.userChanged = 'true';
                }
            });
        }
    });

    // Reset userChanged when opening add view for new seed
    window.openAddForm = (seed = null) => {
        // This is a bridge, the real implementation is at line 1050
        if (typeof openAddForm === 'function') openAddForm();
    };

    // Handle month pickers manually
    document.querySelectorAll('.month-picker-container').forEach(cont => {
        cont.addEventListener('click', () => {
            const group = cont.closest('.form-group');
            if (group) {
                const badge = group.querySelector('.ai-badge');
                if (badge) badge.remove();
            }
        });
    });

    if (btnDetailEdit) {
        btnDetailEdit.onclick = () => {
            const seedId = viewDetail.dataset.currentSeedId;
            const seed = seeds.find(s => String(s.id) === String(seedId));
            if (seed) openEditView(seed);
        };
    }

    if (btnDetailDelete) {
        btnDetailDelete.onclick = async () => {
            const seedId = viewDetail.dataset.currentSeedId;
            const seed = seeds.find(s => String(s.id) === String(seedId));
            if (!seed) return;
            if (confirm(`Weet je zeker dat je "${seed.naam}" wilt verwijderen?`)) {
                await deleteSeedDB(seed.id);
                seeds = await getAllSeeds();
                showToast("Zaadje verwijderd! 🗑️");
                
                // Force global UI refresh
                renderHome();
                applyFilters();
                renderSowingGrid();
                renderCalendar();
                
                switchView('list');
            }
        };
    }

    async function saveCurrentForm() {
        if (viewAdd.classList.contains('hidden')) return;
        const naam = inputNaam.value.trim();
        if (!naam) return;

        // Duplicate check for new entries
        if (!editingId) {
            const exists = seeds.some(s => s.naam.toLowerCase() === naam.toLowerCase());
            if (exists) {
                showToast("Deze plant staat al in je tuin! 🌿");
                const btnSave = document.getElementById('btn-save-seed');
                if (btnSave) btnSave.disabled = false;
                return;
            }
        }

        const selectedTags = Array.from(document.querySelectorAll('.tag-picker-chip.active')).map(c => c.dataset.tag);
        const existing = editingId ? seeds.find(s => s.id === editingId) : null;

        const newSeed = {
            id: editingId || Date.now().toString(),
            naam: naam,
            code: document.getElementById('code')?.value.trim() || '',
            type: inputType?.value || 'Overig',
            standplaats: inputStandplaats?.value || 'Zon',
            water: inputWater?.value || 'Gemiddeld',
            status: inputStatus?.value || 'Voorraad',
            fase_gezaaid: (existing && inputStatus?.value === existing.status) ? existing.fase_gezaaid : (inputStatus?.value !== 'Voorraad' && inputStatus?.value !== 'Wishlist'),
            fase_groeit: (existing && inputStatus?.value === existing.status) ? existing.fase_groeit : (inputStatus?.value === 'Groeit'),
            fase_geoogst: (existing && inputStatus?.value === existing.status) ? existing.fase_geoogst : (inputStatus?.value === 'Geoogst'),
            zaaitijd: getSelectedMonthsFromPicker('zaaitijd-picker'),

            oogsttijd: getSelectedMonthsFromPicker('oogsttijd-picker'),
            lastSownYear: (inputStatus?.value === 'Gezaaid' || inputStatus?.value === 'Groeit') ? new Date().getFullYear() : (existing ? existing.lastSownYear : null),
            ervaringScore: parseInt(document.getElementById('star-rating-picker')?.dataset.value) || 0,
            purchaseYear: parseInt(document.getElementById('purchaseYear')?.value) || null,
            shopLink: document.getElementById('shopLink')?.value.trim() || '',
            beschrijving: inputBeschrijving?.value.trim() || '',
            ervaringen: inputErvaringen?.value.trim() || '',
            images: pendingImages,
            tags: selectedTags,
            featuredImageUrl: inputNaam.dataset.featuredUrl || (pendingImages.length > 0 ? pendingImages[0].url : ''),
            isFavorite: existing ? (existing.isFavorite || false) : false
        };
        if (newSeed.status === 'Wishlist') {
            addToWishlistFromCard(newSeed);
        }
        await saveSeed(newSeed);
        seeds = await getAllSeeds();
        
        // Ensure UI reflects changes everywhere
        renderHome();
        applyFilters();
        renderSowingGrid();
        renderCalendar();
        
        showToast(editingId ? "Wijzigingen opgeslagen! ✨" : "Nieuwe plant toegevoegd! 🌱");
        switchView('list');
    }

    // --- LIST RENDERING ---
    function getStatusLabel(status) {
        const labels = {
            'Voorraad': 'In voorraad',
            'Gezaaid': 'Gezaaid',
            'Groeit': 'Groeit',
            'Geoogst': 'Geoogst',
            'Wishlist': 'Op wishlist'
        };
        return labels[status] || status;
    }

    // Helper to determine the visual main status based on priority
    function deriveMainStatus(s) {
        if (s.fase_groeit) return 'Groeit';
        if (s.fase_geoogst) return 'Geoogst';
        if (s.fase_gezaaid) return 'Gezaaid';
        if (s.status === 'Wishlist') return 'Wishlist';
        return 'Voorraad';
    }

    function renderSeeds(items) {


        if (!seedGrid) return;
        seedGrid.innerHTML = '';

        if (items.length === 0) {
            const q = searchInput.value;
            const hasFilters = activeCategory !== 'Alles' || activeMonthFilter !== null || q;
            
            const msg = hasFilters ? "Geen resultaten gevonden" : "Je hebt nog geen zaden toegevoegd";
            const submsg = hasFilters ? "Met deze filters of zoekterm konden we niets vinden." : "Begin met het toevoegen van je eerste plant.";
            const btnText = hasFilters ? "Wis filters & toon alles" : "Voeg je eerste zaadje toe +";
            const clickAction = hasFilters ? "window._resetAllFilters()" : "window.openAddForm()";

            seedGrid.innerHTML = `
                <div class="empty-state" style="padding: 60px 20px;">
                    <p style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">${msg}</p>
                    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">${submsg}</p>
                    <button class="empty-state-btn" onclick="${clickAction}">${btnText}</button>
                </div>`;
            return;
        }

        const favorites = items.filter(s => s.isFavorite);
        const others = items.filter(s => !s.isFavorite);

        if (favorites.length > 0) {
            const favHeader = document.createElement('div');
            favHeader.className = 'list-section-header fav';
            favHeader.style.gridColumn = '1 / -1';
            favHeader.innerHTML = `⭐ Favorieten`;
            seedGrid.appendChild(favHeader);
            favorites.forEach(s => seedGrid.appendChild(createSeedCard(s)));

            if (others.length > 0) {
                const otherHeader = document.createElement('div');
                otherHeader.className = 'list-section-header';
                otherHeader.style.gridColumn = '1 / -1';
                otherHeader.innerHTML = `🌱 Overige zaden`;
                seedGrid.appendChild(otherHeader);
            }
        }
        others.forEach(s => seedGrid.appendChild(createSeedCard(s)));
    }

    function createSeedCard(seed) {
        const card = document.createElement('div');
        card.className = 'seed-card';
        card.dataset.id = seed.id;
        card.id = `seed-card-${seed.id}`;
        // Priority: featuredImageUrl > image > first image > placeholder
        const img = seed.featuredImageUrl || seed.image || (seed.images && seed.images.length > 0 ? seed.images[0].url : null);
        const imgHTML = img ? `<div class="card-img" style="background-image: url('${img}')"></div>` : `<div class="card-img placeholder-img">🌱</div>`;
        const nameH = highlightSearchTerm(seed.naam, searchInput.value);


        const sowingRange = formatMonthRanges(getActiveMonths(seed));
        const harvestRange = formatMonthRanges(getActiveMonths(seed.oogsttijd));

        card.innerHTML = `
            ${imgHTML}
            <div class="card-actions-top-right">
                ${seed.isFavorite ? '<span class="action-icon-static">⭐</span>' : ''}
            </div>
            <div class="card-content">
                <div class="card-badges" style="display:flex; gap:6px; margin-bottom:8px;">
                    <span class="badge ${seed.type.toLowerCase()}" style="font-weight: 700;">${seed.type}</span>
                    <span class="badge ${seed.status.toLowerCase()}" style="opacity: 0.8;">${getStatusLabel(seed.status)}</span>
                </div>
                <h3 style="margin:0 0 4px 0; font-size:17px;">${nameH}</h3>
                ${seed.code ? `<div style="font-size:11px; color:var(--text-muted); margin-bottom: 6px; opacity: 0.8; font-weight: 500; font-family: monospace;"># ${seed.code}</div>` : ''}
                <div class="seed-meta">
                  <p class="seed-sow">📅 Zaaien: ${sowingRange || 'n.v.t.'}</p>
                  <p class="seed-harvest">🥗 Oogst: ${harvestRange || 'n.v.t.'}</p>
                </div>
            </div>
        `;

        card.onclick = () => openDetailView(seed);
        return card;
    }

    function addToWishlistFromCard(seed) {
        const exists = wishlist.some(item => item.name.toLowerCase() === seed.naam.toLowerCase());
        if (exists) {
            showToast("Staat al op je wishlist! 🔖");
            return;
        }

        const img = seed.featuredImageUrl || (seed.images && seed.images.length > 0 ? seed.images[0].url : '');

        const newItem = {
            id: Date.now().toString(),
            name: seed.naam,
            link: '',
            image: img,
            note: '',
            type: 'seed',
            bought: false
        };

        wishlist.unshift(newItem);
        saveWish();
        showToast("Toegevoegd aan wishlist ✨");
    }

    function highlightSearchTerm(text, q) {
        if (!q) return text;
        const regex = new RegExp(`(${q})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }


    // --- DETAIL VIEW ---
    function openDetailView(seed) {
        viewDetail.dataset.currentSeedId = seed.id; // Store for edit button
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Ensure page is at top when opening detail

        // Data Validation & Normalization
        const sowingMonthsSet = getActiveMonths(seed);

        if (sowingMonthsSet.size === 0) {
            console.warn("No sowing months found for seed:", seed.naam);
        }

        // Image logic
        const featuredImg = seed.featuredImageUrl || seed.image || (seed.images && seed.images.length > 0 ? seed.images[0].url : null);
        const headerImgHTML = featuredImg ? `<img src="${featuredImg}" alt="${seed.naam}" class="detail-hero-img">` : '<div class="card-img placeholder-img">🌱</div>';

        let carouselHTML = '';
        // Combine image sources for gallery
        let allImages = seed.images ? [...seed.images] : [];
        if (seed.image && !allImages.some(img => img.url === seed.image)) {
            allImages.unshift({ url: seed.image, id: 'starter', caption: 'Starter Foto' });
        }

        if (allImages.length > 0) {
            window._currentDetailImages = allImages;
            const items = allImages.map((img, idx) => `
                <div class="detail-carousel-item" onclick="openLightbox(window._currentDetailImages, ${idx})">
                    <img src="${img.url}" alt="Foto ${idx + 1}" loading="lazy">
                </div>
            `).join('');
            carouselHTML = `
                <div class="detail-carousel-section">
                    <h4>🖼️ Fotogalerij</h4>
                    <div class="detail-carousel">${items}</div>
                </div>
            `;
        }

        const actionRow = `
            <div class="detail-action-row" style="padding: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn-action-chip ${seed.fase_gezaaid ? 'active' : ''}" onclick="window._updateStatus('${seed.id}', 'Gezaaid')" aria-label="Markeer als gezaaid">🌱 Gezaaid</button>
                <button class="btn-action-chip ${seed.fase_groeit ? 'active' : ''}" onclick="window._updateStatus('${seed.id}', 'Groeit')" aria-label="Markeer als Groeit">🌿 Groeit</button>
                <button class="btn-action-chip ${seed.fase_geoogst ? 'active' : ''}" onclick="window._updateStatus('${seed.id}', 'Geoogst')" aria-label="Markeer als geoogst">🧺 Oogst</button>
                <button class="btn-action-chip fav-chip ${seed.isFavorite ? 'active' : ''}" onclick="window._toggleFavContent('${seed.id}')" aria-label="Wissel favoriet"><span>${seed.isFavorite ? '⭐' : '☆'}</span> Fav</button>
            </div>
        `;

        // Render Sowing Months as chips
        let sowingHTML = '';
        if (sowingMonthsSet.size > 0) {
            const chips = monthNamesShort.map((m, i) => `
                <div class="month-bubble ${sowingMonthsSet.has(i) ? 'active' : ''}">${m}</div>
            `).join('');
            sowingHTML = `<div class="month-bar" style="grid-template-columns: repeat(6, 1fr); margin-top: 8px;">${chips}</div>`;
        } else {
            sowingHTML = `<span class="muted-value">Geen zaaitijd (n.v.t.)</span>`;
        }

        detailBody.innerHTML = `
            <div class="header-image">
                ${headerImgHTML}
                <!-- Header Content Overlays -->
                <div style="position: absolute; top: 30px; left: 20px; right: 20px; z-index: 20; pointer-events: none;">
                    <h1 style="margin: 0; font-size: 24px; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.6);">${seed.naam}</h1>
                </div>

                <div style="position: absolute; bottom: 20px; left: 20px; right: 20px; display: flex; justify-content: space-between; align-items: flex-end; z-index: 20; pointer-events: none;">
                    <div style="display: flex; gap: 8px;">
                        ${(seed.tags || []).some(t => t.toLowerCase().includes('lastige kiemer')) ? `
                            <span class="category-badge difficult-germinator">
                                <span>🌱</span> Lastige kiemer
                            </span>
                        ` : ''}
                    </div>
                    <div>
                        <span class="category-badge">
                            ${getStatusLabel(seed.status)}
                        </span>
                    </div>
                </div>
            </div>
            ${actionRow}
            <div class="detail-grid" style="padding: 0 20px 20px 20px;">
                <div class="detail-item">
                    <div class="detail-item-icon">☀️</div>
                    <div class="detail-item-content">
                        <strong>Standplaats</strong>
                        <span>${seed.standplaats}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-icon">💧</div>
                    <div class="detail-item-content">
                        <strong>Waterbehoefte</strong>
                        <span>${seed.water ? seed.water.split(' (')[0] : 'n.v.t.'}</span>
                    </div>
                </div>
                <div class="detail-item" style="grid-column: 1/-1;">
                    <div class="detail-item-icon">🌱</div>
                    <div class="detail-item-content">
                        <strong>Wanneer zaaien?</strong>
                        <span style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">${formatMonthRanges(sowingMonthsSet) || 'Geen zaaitijd'}</span>
                        ${sowingHTML}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-icon">🧺</div>
                    <div class="detail-item-content">
                        <strong>Wanneer oogsten?</strong>
                        <span>${formatMonthRanges(getActiveMonths(seed.oogsttijd)) || 'n.v.t.'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-icon">📋</div>
                    <div class="detail-item-content">
                        <strong>Huidige Status</strong>
                        <span>${seed.status}</span>
                    </div>
                </div>
                ${seed.code ? `
                <div class="detail-item">
                    <div class="detail-item-icon">📍</div>
                    <div class="detail-item-content">
                        <strong>Code / Locatie</strong>
                        <span>${seed.code}</span>
                    </div>
                </div>
                ` : ''}
                ${seed.purchaseYear ? `
                <div class="detail-item">
                    <div class="detail-item-icon">📅</div>
                    <div class="detail-item-content">
                        <strong>Gekocht</strong>
                        <span>${seed.purchaseYear}</span>
                    </div>
                </div>
                ` : ''}
                ${seed.shopLink ? `
                <div class="detail-item">
                    <div class="detail-item-icon">🔗</div>
                    <div class="detail-item-content">
                        <strong>Webshop</strong>
                        <a href="${seed.shopLink}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); text-decoration: none; font-weight: 600;">Bekijk product</a>
                    </div>
                </div>
                ` : ''}
            </div>
            ${seed.ervaringScore > 0 ? `
                <div class="rating-section" style="padding: 0 20px 10px 20px; margin-top: -10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Mijn ervaring:</span>
                        ${renderStars(seed.ervaringScore)}
                    </div>
                </div>
            ` : ''}
            ${(() => {
                if (seed.tags && seed.tags.length > 0) {
                    const chips = seed.tags.map(t => `<span class="tag-chip">${t}</span>`).join('');
                    return `
                        <div class="tags-section" style="padding: 0 20px 20px 20px; margin-top: 6px;">
                            <h4 style="font-size: 14px; font-weight: 700; margin-bottom: 10px; color: var(--text-main); opacity: 0.8; display: flex; align-items: center; gap: 6px;"><span style="color: #2E7D32; font-size: 11px; opacity: 0.7;">●</span> Kenmerken</h4>
                            <div class="tags-container" style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${seed.tags.map(t => `<span class="tag-chip"><span class="tag-text">${t}</span></span>`).join('')}
                            </div>
                        </div>
                    `;
                }
                return '';
            })()}

            <div style="padding: 0 20px 20px 20px;">
                <div class="detail-item" style="flex-direction: column; align-items: stretch; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px;">📋 Informatie</h4>
                    <p style="white-space:pre-wrap; margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-main);">${seed.beschrijving || 'Geen info'}</p>
                </div>
                
                <div class="detail-item" style="flex-direction: column; align-items: stretch;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px;">📖 Beschrijving</h4>
                    <p style="white-space:pre-wrap; margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-main);">${seed.ervaringen || 'Geen notities'}</p>
                </div>
            </div>
            ${renderRecipeSuggestions(seed)}
            ${carouselHTML}
        `;

    function getRecipeSearchUrl(plantName, recipeTitle) {
        const query = `${plantName} ${recipeTitle} recept`;
        return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }

    function shuffleArray(arr) {
        return [...arr].sort(() => 0.5 - Math.random());
    }

    function renderRecipeSuggestions(seed) {
        // Alleen tonen voor eetbare planten (check tags of type)
        const isEdible = (seed.tags || []).some(t => t.toLowerCase().includes('eetbaar')) || 
                         ['Groente', 'Fruit', 'Kruid'].includes(seed.type);
        
        if (!isEdible) return '';
        
        const recipesData = {
            'tomaat': ['Pasta saus', 'Bruschetta', 'Tomatensoep', 'Gepofte tomaatjes', 'Caprese salade', 'Tomaten salsa'],
            'courgette': ['Pannenkoekjes', 'Gevulde courgette', 'Courgette soep', 'Gegrilde plakjes', 'Ratatouille', 'Courgette taart'],
            'radijs': ['Salade', 'Toast met roomkaas', 'Ingelegde radijsjes', 'Gebakken radijs', 'Dip met kwark'],
            'spinazie': ['Pasta pesto', 'Spinazie a la creme', 'Gado Gado', 'Frisse spinazie salade', 'Quiche met spinazie'],
            'sla': ['Groene salade', 'Stamppot sla', 'Wraps', 'Sla soep', 'Salade niçoise'],
            'paprika': ['Gevulde paprika', 'Ratatouille', 'Huisgemaakte sambal', 'Geroosterde paprika dip', 'Paprika soep'],
            'peper': ['Chilisaus', 'Peperolie', 'Salsa', 'Sambal', 'Gedroogde vlokken'],
            'komkommer': ['Komkommersalade', 'Tzatziki', 'Pickles', 'Komkommer soep', 'Frisse smoothie'],
            'aardbei': ['Jam', 'Smoothie', 'Salade', 'Aardbeien kwark', 'Zomerse bowl'],
            'basilicum': ['Pesto', 'Caprese', 'Kruidenolie', 'Basilicum siroop', 'Infused water'],
            'munt': ['Muntthee', 'Mocktail', 'Tabbouleh', 'Munt dipsaus', 'Verse salade'],
            'wortel': ['Worteltaart', 'Ovenwortels', 'Hutspot', 'Wortelsalade', 'Wortelsoep'],
            'biet': ['Salade met geitenkaas', 'Borsjt', 'Geroosterde bieden', 'Bietenhulmus', 'Carpaccio van biet'],
            'broccoli': ['Broccoli ovenschotel', 'Broccolisoep', 'Wokgerecht', 'Broccoli salade', 'Pasta broccoli'],
            'boerenkool': ['Stamppot', 'Chips', 'Smoothie', 'Salade met appel', 'Boerenkool pesto'],
            'pompoen': ['Pompoensoep', 'Geroosterde pompoen', 'Pompoentaart', 'Gevulde pompoen', 'Risotto met pompoen']
        };

        const plantName = seed.naam || 'deze plant';
        const nameLower = plantName.toLowerCase();
        let rawRecipes = [];
        
        for (let key in recipesData) {
            if (nameLower.includes(key)) {
                rawRecipes = recipesData[key];
                break;
            }
        }

        // Fallback: Als geen specifieke recepten gevonden zijn
        if (rawRecipes.length === 0) {
            rawRecipes = ['Simpele bereiding', 'Salade', 'Oven gerecht', 'Snelle snack', 'Roerbak gerecht', 'Gezonde lunch'];
        }

        // Shuffle en pak max 3
        const recipes = shuffleArray(rawRecipes).slice(0, 3);

        const title = seed.naam ? `Met je ${seed.naam} maken` : 'Recept ideeën';

        return `
            <div class="recipe-section" style="padding: 0 20px 20px 20px; margin-top: 16px;">
                <div style="margin-bottom: 16px;">
                    <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">${title}</h4>
                    <p style="font-size: 12px; color: var(--text-muted); margin: 0;">Gebruik je oogst direct in de keuken.</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${recipes.map((r, idx) => {
                        const searchUrl = getRecipeSearchUrl(plantName, r);
                        const isFirst = idx === 0;
                        return `
                        <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="recipe-card-v2 ${isFirst ? 'prominent' : ''}">
                            <span>${r}</span>
                            <span class="recipe-icon">↗</span>
                        </a>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }


        // Fix duplicate rendering: ONLY append image if not already present
        const bannerContainer = detailBody.querySelector('.header-image');
        if (bannerContainer && seed.featuredImageUrl) {
            if (!bannerContainer.querySelector('img')) {
                const img = document.createElement('img');
                img.src = seed.featuredImageUrl;
                img.alt = seed.naam;
                // Prepend so it sits behind the overlay/content
                bannerContainer.prepend(img);
            }
        }

        detailBody.style.paddingBottom = '40px';
        switchView('detail');
    }
    window.openDetailView = openDetailView;

    // Helper exposed for inline onclicks
    window._updateStatus = async (id, status) => {
        const seed = seeds.find(s => String(s.id) === String(id));
        if (seed) {
            updateQuickStatus(seed, status);
            incrementDailyProgress();
        }
    };
    window._toggleFavContent = async (id) => {
        const seed = seeds.find(s => String(s.id) === String(id));
        if (seed) toggleQuickFavorite(seed);
    };

    function openEditView(seed) {
        editingId = seed.id;
        inputNaam.value = seed.naam;
        inputNaam.dataset.featuredUrl = seed.featuredImageUrl || '';
        if (inputType) inputType.value = seed.type;
        if (inputStandplaats) inputStandplaats.value = seed.standplaats;
        if (inputWater) inputWater.value = seed.water;
        if (inputStatus) inputStatus.value = seed.status || 'Voorraad';
        const codeInput = document.getElementById('code');
        if (codeInput) codeInput.value = seed.code || '';

        // ALWAYS initialize pickers so 12 months are rendered
        initMonthPicker('zaaitijd-picker');
        initMonthPicker('oogsttijd-picker');

        // Highlight active months (using seed object for sowing to pick up varied fields)
        setSelectedMonthsInPicker('zaaitijd-picker', seed);
        setSelectedMonthsInPicker('oogsttijd-picker', seed.oogsttijd);

        if (inputBeschrijving) inputBeschrijving.value = seed.beschrijving || '';
        if (inputErvaringen) inputErvaringen.value = seed.ervaringen || '';

        const pyInput = document.getElementById('purchaseYear');
        if (pyInput) pyInput.value = seed.purchaseYear || '';
        const slInput = document.getElementById('shopLink');
        if (slInput) slInput.value = seed.shopLink || '';

        const starPicker = document.getElementById('star-rating-picker');
        if (starPicker) {
            starPicker.dataset.value = seed.ervaringScore || 0;
            initStarPicker();
        }

        renderTagPicker(seed.tags || []);
        
        // Ensure all historical image sources are captured in the editable gallery
        pendingImages = seed.images ? [...seed.images] : [];
        if (seed.image && !pendingImages.some(img => img.url === seed.image)) {
            pendingImages.unshift({ url: seed.image, id: 'legacy-import-' + Date.now(), caption: 'Geadviseerde Foto' });
        }
        if (seed.featuredImageUrl && !pendingImages.some(img => img.url === seed.featuredImageUrl)) {
            pendingImages.unshift({ url: seed.featuredImageUrl, id: 'featured-import-' + Date.now(), caption: 'Hoofdfoto' });
        }

        photoSearchResults = [];
        const pexelsInput = document.getElementById('pexels-search-input');
        if (pexelsInput) pexelsInput.value = '';
        const banner = document.getElementById('suggestion-banner');
        if (banner) banner.classList.add('hidden');
        clearAiIndicators();
        renderUnifiedGallery();

        btnSubmitForm.textContent = 'Wijzigingen Opslaan';
        document.getElementById('btn-form-delete')?.classList.remove('hidden');
        switchView('add');
    }

    function renderQuickActions(seed) {
        const container = document.getElementById('detail-sticky-actions');
        if (!container) return;
        container.innerHTML = `
            <button class="action-btn-quick ${seed.fase_gezaaid ? 'active-sown' : ''}" id="q-sown" aria-label="Gezaaid"><span>🌱</span>Gezaaid</button>
            <button class="action-btn-quick ${seed.fase_groeit ? 'active-growing' : ''}" id="q-grow" aria-label="Groeit"><span>🌿</span>Groeit</button>
            <button class="action-btn-quick ${seed.fase_geoogst ? 'active-harvested' : ''}" id="q-harvest" aria-label="Oogst"><span>🧺</span>Oogst</button>
            <button class="action-btn-quick ${seed.isFavorite ? 'active-favorite' : ''}" id="q-fav" aria-label="Favoriet"><span>${seed.isFavorite ? '⭐' : '☆'}</span>Fav</button>
        `;
        document.getElementById('q-sown').onclick = () => { window._updateStatus(seed.id, 'Gezaaid'); };
        document.getElementById('q-grow').onclick = () => { window._updateStatus(seed.id, 'Groeit'); };
        document.getElementById('q-harvest').onclick = () => { window._updateStatus(seed.id, 'Geoogst'); };
        document.getElementById('q-fav').onclick = () => toggleQuickFavorite(seed);
    }

    async function updateQuickStatus(seed, togglePhase) {
        // Initialize flags for existing data if missing
        if (seed.fase_gezaaid === undefined) seed.fase_gezaaid = (seed.status === 'Gezaaid' || seed.status === 'Groeit' || seed.status === 'Geoogst');
        if (seed.fase_groeit === undefined) seed.fase_groeit = (seed.status === 'Groeit');
        if (seed.fase_geoogst === undefined) seed.fase_geoogst = (seed.status === 'Geoogst');

        // Toggle the selected phase
        if (togglePhase === 'Gezaaid') seed.fase_gezaaid = !seed.fase_gezaaid;
        if (togglePhase === 'Groeit') seed.fase_groeit = !seed.fase_groeit;
        if (togglePhase === 'Geoogst') seed.fase_geoogst = !seed.fase_geoogst;

        // Auto-detect Gezaaid if Growing or Harvested is active
        if (seed.fase_groeit || seed.fase_geoogst) seed.fase_gezaaid = true;

        // Recalculate main status for filters/badges
        const newMainStatus = deriveMainStatus(seed);
        seed.status = newMainStatus;

        if (seed.fase_gezaaid) {
            seed.lastSownYear = seed.lastSownYear || new Date().getFullYear();
        }
        
        await saveSeed(seed);
        showToast(`Status bijgewerkt naar: ${getStatusLabel(newMainStatus)} ✨`);
        openDetailView(seed);
        seeds = await getAllSeeds();
        if (!viewHome.classList.contains('hidden')) renderHome();
        if (!viewList.classList.contains('hidden')) applyFilters();
    }

    async function toggleQuickFavorite(seed) {
        seed.isFavorite = !seed.isFavorite;
        await saveSeed(seed);
        showToast(seed.isFavorite ? 'Favoriet! ⭐' : 'Verwijderd');
        openDetailView(seed);
        seeds = await getAllSeeds();
        if (!viewList.classList.contains('hidden')) applyFilters();
        if (!viewHome.classList.contains('hidden')) renderHome();
    }

    // View Switching
    function switchView(name) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        [viewHome, viewList, viewSowingGrid, viewAdd, viewDetail, viewWishlist, viewCalendar, viewOnboarding].forEach(v => v?.classList.add('hidden'));
        // Sync Mobile Nav (Desktop & Mobile)
        document.querySelectorAll('.nav-buttons button').forEach(b => b?.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
        
        const activeDesktopBtn = document.querySelector(`.nav-buttons button[onclick*="${name}"]`);
        if (activeDesktopBtn) activeDesktopBtn.classList.add('active');
        
        const activeMobileBtn = document.querySelector(`.mobile-nav-item[data-view="${name}"]`);
        if (activeMobileBtn) activeMobileBtn.classList.add('active');

        if (name === 'home') { viewHome?.classList.remove('hidden'); btnHome?.classList.add('active'); renderHome(); }
        else if (name === 'onboarding') { viewOnboarding?.classList.remove('hidden'); }
        else if (name === 'list') {
            viewList?.classList.remove('hidden');
            btnList?.classList.add('active');

            const activeMonth = localStorage.getItem('activeMonthFilter');
            if (activeMonth) {
                applyMonthFilter(activeMonth);
            } else {
                applyFilters();
            }
        }
        else if (name === 'add') { viewAdd?.classList.remove('hidden'); btnAdd?.classList.add('active'); }
        else if (name === 'detail') { viewDetail?.classList.remove('hidden'); }
        else if (name === 'sowing-grid') { viewSowingGrid?.classList.remove('hidden'); btnSowingGrid?.classList.add('active'); renderSowingGrid(); }
        else if (name === 'wishlist') { viewWishlist?.classList.remove('hidden'); btnWishlist?.classList.add('active'); renderWishlist(); }
        else if (name === 'calendar') { viewCalendar?.classList.remove('hidden'); btnCalendar?.classList.add('active'); renderCalendar(); }
    }

    if (btnHome) btnHome.onclick = () => switchView('home');
    if (btnList) btnList.onclick = () => {
        localStorage.removeItem('activeMonthFilter');
        activeMonthFilter = null;
        activeCategory = 'Alles'; // RESET CATEGORY TOO
        if (searchInput) searchInput.value = ''; // CLEAR SEARCH
        switchView('list');
    };
    if (btnSowingGrid) btnSowingGrid.onclick = () => switchView('sowing-grid');

    // MOBILE NAV LISTENERS (Safe & Robust)
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const view = this.dataset.view;
            if (!view) return;
            
            if (view === 'list') {
                localStorage.removeItem('activeMonthFilter');
                activeMonthFilter = null;
                activeCategory = 'Alles'; 
                if (searchInput) searchInput.value = '';
            }
            switchView(view);
        });
    });

    // New simplified Add trigger from Zaden page
    const btnAddZadenTop = document.getElementById('btn-add-zaden-top');
    const openAddForm = () => {
        editingId = null;
        seedForm?.reset();
        pendingImages = [];
        photoSearchResults = [];
        displayedPhotoCount = 15;
        if (inputNaam) delete inputNaam.dataset.featuredUrl;
        
        // --- NOTE PARSER LOGIC ---
        const btnScanNotes = document.getElementById('btn-scan-notes');
        const parserModal = document.getElementById('note-parser-modal');
        const btnRunParser = document.getElementById('btn-run-parser');
        const parserInput = document.getElementById('note-parser-input');
        const parserList = document.getElementById('parser-results-list');
        const parserSection = document.getElementById('parser-results-section');

        if (btnScanNotes) {
            btnScanNotes.onclick = () => {
                parserModal.classList.remove('hidden');
                parserInput.value = '';
                parserSection.classList.add('hidden');
            };
        }

        if (btnRunParser) {
            btnRunParser.onclick = async () => {
                const text = parserInput.value.trim();
                if (!text) {
                    showToast("Voer eerst wat tekst in! ✍️");
                    return;
                }

                btnRunParser.disabled = true;
                const originalText = btnRunParser.textContent;
                btnRunParser.textContent = "Bezig met scannen... ✨";

                try {
                    const foundPlants = [];
                    const lowerText = text.toLowerCase();

                    // 1. Lokale match (mockData)
                    for (let key in mockData) {
                        if (lowerText.includes(key.toLowerCase())) {
                            foundPlants.push({ name: key });
                        }
                    }

                    // 2. AI Fallback (if few plants or just to be smart)
                    if (foundPlants.length < 5) {
                        try {
                            const aiRes = await vraagAI('parse_notes_for_seeds', text);
                            const jsonStr = aiRes.match(/\[[\s\S]*\]/)?.[0];
                            if (jsonStr) {
                                const aiPlants = JSON.parse(jsonStr);
                                aiPlants.forEach(p => {
                                    const pName = typeof p === 'string' ? p : p.name;
                                    if (pName && !foundPlants.some(fp => fp.name.toLowerCase() === pName.toLowerCase())) {
                                        foundPlants.push({ name: pName });
                                    }
                                });
                            }
                        } catch(e) { console.warn("AI Parser failed", e); }
                    }

                    if (foundPlants.length > 0) {
                        parserSection.classList.remove('hidden');
                        parserList.innerHTML = foundPlants.map(p => `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-color); border-radius: 12px; border: 1px solid var(--border-color);">
                                <span style="font-weight: 600; color: var(--text-main);">${p.name}</span>
                                <button class="btn-primary-sm" onclick="window._addParsedSeed('${p.name.replace(/'/g, "\\'")}')" style="padding: 6px 12px; font-size: 11px;">Toevoegen</button>
                            </div>
                        `).join('');
                    } else {
                        showToast("Geen planten herkend. Probeer duidelijker namen.");
                    }
                } finally {
                    btnRunParser.disabled = false;
                    btnRunParser.textContent = originalText;
                }
            };
        }

        window._addParsedSeed = async (name) => {
            parserModal.classList.add('hidden');
            openAddForm();
            inputNaam.value = name;
            // Trigger auto-fill automatically to make it feel magic
            triggerAutoFill(false); 
            showToast(`Seed herkend: ${name} ✨`);
        };

        // Reset manual change tracking
        [inputType, inputStandplaats, inputWater, inputBeschrijving].forEach(inp => {
            if (inp) {
                delete inp.dataset.userChanged;
                const group = inp.closest('.form-group');
                if (group) {
                    const badge = group.querySelector('.ai-badge');
                    if (badge) badge.remove();
                }
            }
        });

        const banner = document.getElementById('suggestion-banner');
        if (banner) banner.classList.add('hidden');

        const sourceStatus = document.getElementById('ai-source-status');
        if (sourceStatus) {
            sourceStatus.classList.add('hidden');
            sourceStatus.classList.remove('visible');
        }

        clearAiIndicators();

        renderUnifiedGallery();
        renderTagPicker();
        initMonthPicker('zaaitijd-picker');
        initMonthPicker('oogsttijd-picker');
        initStarPicker();

        const pyInput = document.getElementById('purchaseYear');
        if (pyInput) pyInput.value = new Date().getFullYear();
        const slInput = document.getElementById('shopLink');
        if (slInput) slInput.value = '';

        btnSubmitForm.textContent = 'Zaadje Opslaan';
        document.getElementById('btn-form-delete')?.classList.add('hidden');
        document.getElementById('pexels-mini-search')?.classList.add('hidden');
        switchView('add');
    };
    if (btnAddZadenTop) btnAddZadenTop.onclick = openAddForm;
    window.openAddForm = openAddForm;
    const btnQuickPhotoSearch = document.getElementById('btn-quick-photo-search');
    const unifiedGallery = document.getElementById('unified-image-gallery');

    if (btnQuickPhotoSearch) {
        btnQuickPhotoSearch.onclick = async () => {
            const query = inputNaam.value.trim();
            if (!query) {
                showToast("Vul eerst een naam in om foto's te zoeken! ✌️");
                return;
            }

            // --- CRITICAL FIX: Clear old results immediately ---
            photoSearchResults = [];
            photoSearchResults = [];
            displayedPhotoCount = 15;
            renderUnifiedGallery();

            btnQuickPhotoSearch.disabled = true;
            btnQuickPhotoSearch.innerHTML = "⏳ Bezig met zoeken...";

            try {
                const results = await searchPlantImage(query);
                if (results && results.length > 0) {
                    photoSearchResults = results.map(r => ({
                        url: r.url,
                        source: 'web',
                        id: r.id || Math.random().toString(36).substr(2, 9)
                    }));
                } else {
                    // No results is not a hard error, just show toast once
                    showToast(`Geen foto's gevonden voor "${query}".`);
                }
                renderUnifiedGallery();
            } catch (err) {
                console.error("Pexels Search Error:", err);
                showToast("Foto-informatie niet bereikbaar.");
            } finally {
                btnQuickPhotoSearch.disabled = false;
                btnQuickPhotoSearch.innerHTML = "🔍 Zoek foto's op naam";
            }
        };
    }

    function renderUnifiedGallery() {
        if (!unifiedGallery) return;
        unifiedGallery.innerHTML = '';

        // Combine selected images and current search results into one view
        // Priority: show results, but mark if they are in pendingImages

        const currentFeatured = inputNaam.dataset.featuredUrl;

        // If everything is empty
        if (pendingImages.length === 0 && photoSearchResults.length === 0) {
            unifiedGallery.innerHTML = `
                <div class="hub-empty">
                   <span>📸 Nog geen foto's geselecteerd of gezocht.</span>
                   <span style="font-size: 11px; font-weight: 400; opacity: 0.6;">Voer een naam in en klik op "Zoek foto's" om resultaten te zien.</span>
                </div>`;
            return;
        }

        // Show pending (selected/uploaded) images first if no active search results
        // Actually, merged list is better.
        // We show all search results + any pending images that are NOT in results
        const displayedItems = [...photoSearchResults];
        pendingImages.forEach(p => {
            if (!displayedItems.some(d => d.url === p.url)) {
                displayedItems.unshift(p);
            }
        });

        displayedItems.forEach((item, idx) => {
            // Apply limit only to web results that are NOT selected
            const isSelected = pendingImages.some(p => p.url === item.url);

            // If it's a web result, not selected, and beyond the limit: skip
            // Note: we want to show all selected images anyway
            if (!isSelected && photoSearchResults.some(s => s.url === item.url)) {
                const searchIdx = photoSearchResults.findIndex(s => s.url === item.url);
                if (searchIdx >= displayedPhotoCount) return;
            }

            // Show Load More button if there are more results
            const loadMoreWrap = document.getElementById('photo-load-more');
            if (loadMoreWrap) {
                if (photoSearchResults.length > displayedPhotoCount) {
                    loadMoreWrap.classList.remove('hidden');
                } else {
                    loadMoreWrap.classList.add('hidden');
                }
            }

            const currentFeatured = inputNaam.dataset.featuredUrl;
            const isFeatured = currentFeatured === item.url || (!currentFeatured && pendingImages[0]?.url === item.url && isSelected);

            if (isFeatured && !inputNaam.dataset.featuredUrl && isSelected) {
                inputNaam.dataset.featuredUrl = item.url;
            }

            const card = document.createElement('div');
            card.className = `unified-gallery-card ${isSelected ? 'selected' : ''} ${isFeatured ? 'featured' : ''}`;
            card.innerHTML = `
                <img src="${item.url}" loading="lazy">
                <div class="selected-check">✓</div>
                <div class="featured-star" title="Stel in als hoofdfoto">★</div>
                <div class="featured-label">Hoofdfoto</div>
                <div class="card-overlay">
                    <button type="button" class="card-feature-btn">★ Maak hoofdfoto</button>
                    <button type="button" class="card-select-btn">${isSelected ? 'Verwijder' : 'Selecteer'}</button>
                </div>
            `;

            card.onclick = (e) => {
                // Feature star click
                if (e.target.classList.contains('featured-star') || e.target.classList.contains('card-feature-btn')) {
                    e.stopPropagation();
                    if (!pendingImages.some(p => p.url === item.url)) {
                        pendingImages.push(item);
                    }
                    inputNaam.dataset.featuredUrl = item.url;
                    renderUnifiedGallery();
                    return;
                }

                // Select area click
                if (isSelected) {
                    pendingImages = pendingImages.filter(p => p.url !== item.url);
                    if (inputNaam.dataset.featuredUrl === item.url) {
                        inputNaam.dataset.featuredUrl = pendingImages.length > 0 ? pendingImages[0].url : '';
                    }
                } else {
                    pendingImages.push(item);
                    if (!inputNaam.dataset.featuredUrl) {
                        inputNaam.dataset.featuredUrl = item.url;
                    }
                }
                renderUnifiedGallery();
            };
            unifiedGallery.appendChild(card);
        });

        // Add "More" button if needed
        if (photoSearchResults.length > displayedPhotoCount) {
            const moreContainer = document.createElement('div');
            moreContainer.style.gridColumn = '1 / -1';
            moreContainer.style.textAlign = 'center';
            moreContainer.style.marginTop = '10px';

            const btnMore = document.createElement('button');
            btnMore.type = 'button';
            btnMore.className = 'btn-helper-link';
            btnMore.style.fontSize = '12px';
            btnMore.innerHTML = `⏷ Toon meer foto's (${photoSearchResults.length - displayedPhotoCount} meer)`;
            btnMore.onclick = () => {
                displayedPhotoCount += 15;
                renderUnifiedGallery();
            };
            moreContainer.appendChild(btnMore);
            unifiedGallery.appendChild(moreContainer);
        }
    }

    // --- PHOTO SEARCH IMPROVEMENTS ---
    const btnPexelsCustom = document.getElementById('btn-pexels-custom-search');
    const inputPexelsCustom = document.getElementById('pexels-custom-query');

    if (btnPexelsCustom) {
        btnPexelsCustom.onclick = async () => {
            const query = inputPexelsCustom.value.trim();
            if (!query) return;

            btnPexelsCustom.disabled = true;
            btnPexelsCustom.innerHTML = "⏳...";

            try {
                const results = await searchPlantImage(query);
                if (results && results.length > 0) {
                    const newItems = results.map(r => ({
                        url: r.url,
                        source: 'web',
                        id: r.id || Math.random().toString(36).substr(2, 9)
                    }));
                    // Add new unique items to the result set
                    newItems.forEach(item => {
                        if (!photoSearchResults.some(existing => existing.url === item.url)) {
                            photoSearchResults.push(item);
                        }
                    });
                    displayedPhotoCount = Math.max(displayedPhotoCount, 15);
                    showToast(`${results.length} nieuwe foto's gevonden! 📸`);
                }
                renderUnifiedGallery();
            } catch (e) {
                console.error(e);
            } finally {
                btnPexelsCustom.disabled = false;
                btnPexelsCustom.innerHTML = "🔍 Zoek";
            }
        };

        if (inputPexelsCustom) {
            inputPexelsCustom.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    btnPexelsCustom.click();
                }
            });
        }
    }

    // Link top save button
    const btnSaveTop = document.getElementById('btn-save-top');
    if (btnSaveTop && typeof seedForm !== 'undefined') {
        btnSaveTop.onclick = (e) => {
             e.preventDefault();
             console.log("Top save button clicked");
             // Directly call submit instead of dispatchEvent for better reliability
             const form = document.getElementById('seed-form');
             if (form) {
                 // Trigger the form submit logic
                 form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
             }
        };
    }

    // Wrap the original file upload logic
    const fileInput = document.getElementById('file-upload');
    const dropzone = document.getElementById('dropzone-wide');

    if (dropzone && fileInput) {
        dropzone.onclick = () => fileInput.click();

        fileInput.onchange = (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (re) => {
                    const url = re.target.result; // base64
                    if (!pendingImages.some(p => p.url === url)) {
                        pendingImages.push({ url, source: 'upload' });
                        if (!inputNaam.dataset.featuredUrl) {
                            inputNaam.dataset.featuredUrl = url;
                        }
                        renderUnifiedGallery();
                    }
                };
                reader.readAsDataURL(file);
            });
        };
    }

    // Toggle logic for Extra Section (Notes & Tags)
    const toggleBtn = document.querySelector(".collapsible-toggle-bar");
    const extraSection = document.getElementById("extra-section");

    if (toggleBtn && extraSection) {
        const chevron = toggleBtn.querySelector(".toggle-icon-chevron");
        const textSpan = toggleBtn.querySelector(".toggle-text");

        // Ensure initial state matches localStorage
        const shouldBeExpanded = localStorage.getItem("expanded_extra-section") === "true";
        if (shouldBeExpanded) {
            extraSection.style.display = "block";
            extraSection.classList.remove("collapsed");
            if (chevron) chevron.textContent = "▾";
            if (textSpan) textSpan.textContent = "Notities & kenmerken";
        } else {
            extraSection.style.display = "none";
            extraSection.classList.add("collapsed");
            if (chevron) chevron.textContent = "▸";
            if (textSpan) textSpan.textContent = "Notities & kenmerken (optioneel)";
        }

        toggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const isCurrentlyHidden = extraSection.style.display === "none";

            if (isCurrentlyHidden) {
                extraSection.style.display = "block";
                extraSection.classList.remove("collapsed");
                if (chevron) chevron.textContent = "▾";
                if (textSpan) textSpan.textContent = "Notities & kenmerken";
                localStorage.setItem("expanded_extra-section", "true");
            } else {
                extraSection.style.display = "none";
                extraSection.classList.add("collapsed");
                if (chevron) chevron.textContent = "▸";
                if (textSpan) textSpan.textContent = "Notities & kenmerken (optioneel)";
                localStorage.setItem("expanded_extra-section", "false");
            }
        });
    }

    if (btnWishlist) btnWishlist.onclick = () => switchView('wishlist');
    if (btnCalendar) btnCalendar.onclick = () => switchView('calendar');
    if (btnDetailBack) btnDetailBack.onclick = () => switchView('list');

    // Home Logic - MIJN TUIN DASHBOARD
    function renderHome() {
        const homeTitle = document.getElementById('home-title');
        if (homeTitle) {
            homeTitle.innerHTML = `
                <span style="font-weight: 700;">Tuinjaar – </span>
                <span id="header-year-select" style="cursor: pointer; font-weight: 700; transition: all 0.2s; padding: 0 4px; border-radius: 4px;" 
                      onmouseover="this.style.background='var(--surface-alt)';" 
                      onmouseout="this.style.background='transparent';"
                      onclick="console.log('jaar selector openen')">
                    ${new Date().getFullYear()}
                </span>

            `;
        }

        // Rustige start: Verberg AI output bij render indien niet actief gezocht
        const aiOutput = document.getElementById('ai-assistant-output');
        if (aiOutput && !aiOutput.dataset.active) {
            aiOutput.style.display = 'none';
        }

        const monthsNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
        const currentMonth = new Date().getMonth();
        const nextMonth = (currentMonth + 1) % 12;

        // 2. NU DOEN (Smart Action List)
        // EXPLICIT: Only seeds in 'Voorraad' state can be 'Now' or 'Missed'. 
        // Once sown (Gezaaid), they move out of this list entirely.
        const currentMonthPrefix = new Date().toISOString().substring(0, 7);
        const nuDoenRaw = seeds.filter(s => {
            if (s.status !== 'Voorraad') return false;
            // IF scheduled this month -> Remove from Nu Doen (Requirement 16.3)
            const isScheduled = (reminders || []).some(r => 
                r.title.toLowerCase().includes(s.naam.toLowerCase()) && 
                r.date.startsWith(currentMonthPrefix)
            );
            return !isScheduled;
        });
        const nuDoenAnnotated = nuDoenRaw.map(s => {
            const monthsArr = getActiveMonths(s); // Set of month indices
            const months = Array.from(monthsArr).sort((a,b) => a - b);
            
            let urgency = 10; 
            let label = "";
            let category = "";
            let context = "";

            let suggestion = "";
            let suggestDate = null;
            let calendarStatus = "";

            if (monthsArr.has(currentMonth)) {
                category = "now";
                label = "Nu zaaien";
                urgency = 1;
                context = ""; // We use suggestion instead for 'now'


    // Suggestion/Calendar logic
    const today = new Date();
    const hasReminder = (reminders || []).some(r => r.title.toLowerCase().includes(s.naam.toLowerCase()) && r.date.startsWith(today.toISOString().substring(0, 7)));
    
    if (hasReminder) {
        calendarStatus = "Staat in je kalender";
    } else {
        suggestion = "Laatste kans — plan vandaag";
        suggestDate = today;
    }
} else if (months.some(m => m < currentMonth)) {

    category = "missed";
    label = "Volgend jaar";
    urgency = 20; 
    context = "Voor volgend seizoen";
} else if (monthsArr.has(nextMonth)) {
    category = "soon";
    label = "Binnenkort";
    urgency = 5;
                context = "Binnenkort ideaal moment";
            }

            return { ...s, urgency, label, category, context, suggestion, suggestDate, calendarStatus };
        }).filter(s => s.category !== "").sort((a, b) => a.urgency - b.urgency || a.naam.localeCompare(b.naam));

        const nuDoenContainer = document.getElementById('dashboard-nu-doen');
        if (nuDoenContainer) {
            nuDoenContainer.innerHTML = '';
            
            if (nuDoenAnnotated.length === 0) {
                nuDoenContainer.innerHTML = `
                    <div class="empty-state" style="padding: 24px 0; text-align: center;">
                        <span style="font-size: 32px; display: block; margin-bottom: 8px;">👍</span>
                        <p style="color: var(--text-muted); font-weight: 600;">Alles op schema</p>
                    </div>`;
            } else {
                const groups = [
                    { id: 'now', label: 'Nu zaaien', icon: '🌱', urgency: 0 },
                    { id: 'soon', label: 'Binnenkort', icon: '⌛', urgency: 5 },
                    { id: 'missed', label: 'Volgend jaar', icon: '📅', urgency: 20 }
                ].sort((a,b) => a.urgency - b.urgency);

                const initialLimitNow = 5;
                const initialLimitOthers = 3;
                const expandedLimit = 10;

                groups.forEach(group => {
                    const groupItems = nuDoenAnnotated.filter(s => s.category === group.id);
                    if (groupItems.length === 0) return;

                    const isExpanded = localStorage.getItem(`dashboard_nu_doen_expanded_${group.id}`) === 'true';
                    const initialLimit = group.id === 'now' ? initialLimitNow : initialLimitOthers;
                    const currentLimit = isExpanded ? expandedLimit : initialLimit;

                    const groupDiv = document.createElement('div');
                    groupDiv.className = 'status-group';
                    groupDiv.innerHTML = `<div class="status-group-title ${group.id}">${group.icon} ${group.label} <span style="font-size:10px; margin-left:4px; opacity:0.6; font-weight:400;">(${groupItems.length})</span></div>`;

                    const grid = document.createElement('div');
                    grid.className = 'mini-cards-grid';
                    
                    let itemsInGroup = 0;
                    groupItems.forEach(s => {
                        if (itemsInGroup >= currentLimit) return;

                        const mini = document.createElement('div');
                        mini.className = 'mini-card';
                        if (s.category === 'missed') mini.style.opacity = '0.6';
                        


                        mini.innerHTML = `
                            <div class="mini-card-content">
                                <div class="mini-card-name">
                                    ${s.isFavorite ? '⭐' : ''} ${s.naam}
                                </div>
                                ${ (s.calendarStatus || s.suggestion) ? '' : `<div class="mini-card-context">${s.context}</div>` }
                                ${s.calendarStatus ? `<div class="mini-card-suggestion done" style="opacity:0.5; cursor:default;">📅 ${s.calendarStatus}</div>` : (s.suggestion ? `<div class="mini-card-suggestion" data-type="suggest">${s.suggestion}</div>` : '')}
                            </div>

                            <div class="mini-card-actions">
                                <button class="btn-mini-action" title="Zet in Kalender" data-type="cal">📅</button>
                                <button class="btn-mini-action" title="Markeer als gezaaid" data-type="sown">✔</button>
                            </div>
                        `;
                        
                        // Main click -> Direct to Detail (New requirement)
                        mini.onclick = (e) => {
                            if (e.target.closest('.btn-mini-action')) return;
                            window.openDetailView(s);
                        };

                        // Action Buttons
                        mini.querySelectorAll('.btn-mini-action').forEach(btn => {
                            btn.onclick = async (e) => {
                                e.stopPropagation();
                                const type = btn.dataset.type;
                                
                                if (type === 'sown') {
                                    mini.classList.add('removing');
                                    const targetId = s.id;
                                    setTimeout(async () => {
                                        s.fase_gezaaid = true;
                                        s.status = deriveMainStatus(s);
                                        s.lastSownYear = new Date().getFullYear();

                                        await saveSeed(s);
                                        incrementDailyProgress();
                                        showToast(`Toegevoegd aan <button class="toast-link" onclick="switchView('home')">je tuin</button> 🌱`);
                                        renderHome();
                                        // Optional: Scroll to it in the garden list for feedback (5.17)
                                        setTimeout(() => window.scrollToGardenItem(targetId), 100);
                                    }, 250);
                                } else if (type === 'cal') {
                                    // Requirement 16.1 & 16.2: Direct intent with date picker
                                    const picker = document.createElement('input');
                                    picker.type = 'date';
                                    picker.style.position = 'fixed';
                                    picker.style.top = '0';
                                    picker.style.left = '0';
                                    picker.style.opacity = '0';
                                    picker.style.pointerEvents = 'none';
                                    document.body.appendChild(picker);
                                    
                                    // Default to suggested date if it exists
                                    if (s.suggestDate) {
                                        picker.value = (s.suggestDate instanceof Date) ? s.suggestDate.toISOString().split('T')[0] : s.suggestDate;
                                    } else {
                                        picker.value = new Date().toISOString().split('T')[0];
                                    }

                                    if (picker.showPicker) {
                                        picker.showPicker();
                                    } else {
                                        picker.click();
                                    }
                                    
                                    picker.onchange = () => {
                                        if (picker.value) {
                                            const selectedDate = new Date(picker.value);
                                            const day = selectedDate.getDate();
                                            const month = selectedDate.toLocaleDateString('nl-NL', { month: 'short' });
                                            
                                            // Visual confirmation: Requirement 17.2
                                            mini.innerHTML = `
                                                <div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:var(--primary-color); background:var(--bg-alt); border-radius:12px; font-size:12px;">
                                                    <span style="font-weight:700;">✅ Gepland op ${day} ${month}</span>
                                                </div>
                                            `;
                                            
                                            mini.classList.add('removing');
                                            setTimeout(() => {
                                                addQuickReminder(s, selectedDate);
                                                renderHome(); // Refreshes list, item is now filtered out (17.1)
                                            }, 750);
                                        }
                                        picker.remove();
                                    };
                                    picker.addEventListener('cancel', () => picker.remove());
                                    setTimeout(() => { if (document.body.contains(picker)) picker.remove(); }, 60000);
                                }
                            };
                        });

                        const suggestionEl = mini.querySelector('.mini-card-suggestion');
                        if (suggestionEl && s.suggestDate) {
                            suggestionEl.onclick = (e) => {
                                e.stopPropagation();
                                // Reuse the picker logic for intent from text too
                                const btnCal = mini.querySelector('.btn-mini-action[data-type="cal"]');
                                if (btnCal) btnCal.click();
                            };
                        }

                        grid.appendChild(mini);
                        itemsInGroup++;
                    });

                    groupDiv.appendChild(grid);

                    // Section-specific toggle
                    if (groupItems.length > initialLimit) {
                         const toggleBtn = document.createElement('button');
                         toggleBtn.className = 'btn-footer-toggle';
                         toggleBtn.style.display = 'block';
                         toggleBtn.style.margin = '12px auto 0';
                         
                         if (isExpanded) {
                             toggleBtn.textContent = '▴ Minder weergeven';
                             toggleBtn.onclick = () => {
                                 localStorage.setItem(`dashboard_nu_doen_expanded_${group.id}`, 'false');
                                 renderHome();
                             };
                         } else {
                             const extra = groupItems.length - initialLimit;
                             toggleBtn.textContent = `▾ Meer weergeven (${extra})`;
                             toggleBtn.onclick = () => {
                                 localStorage.setItem(`dashboard_nu_doen_expanded_${group.id}`, 'true');
                                 renderHome();
                             };
                         }
                         groupDiv.appendChild(toggleBtn);
                    }

                    nuDoenContainer.appendChild(groupDiv);
                });
            }
        }

        // 3. MIJN PLANTEN (Mini-cards grouped by status)
        const gardenPlants = seeds.filter(s => s.status === 'Gezaaid' || s.status === 'Groeit' || s.status === 'Geoogst');
        const groupedContainer = document.getElementById('dashboard-mijn-planten-grouped');
        if (groupedContainer) {
            groupedContainer.innerHTML = '';
            const statuses = [
                { id: 'Gezaaid', label: 'Gezaaid', icon: '🌱', colorClass: 'green' },
                { id: 'Groeit', label: 'Groeit', icon: '🌿', colorClass: 'green' },
                { id: 'Geoogst', label: 'Geoogst', icon: '📦', colorClass: 'neutral' }
            ];

            if (gardenPlants.length === 0) {
                groupedContainer.innerHTML = `
                    <div class="empty-state" style="padding: 20px 0;">
                        <p>Je hebt nog niets gezaaid</p>
                        <button class="empty-state-btn" onclick="switchView('list')">Bekijk je zaden</button>
                    </div>`;
            } else {
                const expandedLimit = 10;

                statuses.forEach(status => {
                    const plants = gardenPlants.filter(s => s.status === status.id);
                    if (plants.length === 0) return;

                    const showAllGroup = localStorage.getItem(`garden_group_${status.id}_show_all`) === 'true';
                    const groupInitialLimit = status.id === 'Gezaaid' ? 6 : 3;
                    const currentLimit = showAllGroup ? expandedLimit : groupInitialLimit;

                    let itemsInGroupDisplayed = 0;

                    const group = document.createElement('div');
                    group.className = 'status-group';
                    group.innerHTML = `<div class="status-group-title ${status.colorClass}">${status.icon} ${status.label} <span style="font-size:10px; margin-left:4px; opacity:0.6; font-weight:400;">(${plants.length})</span></div>`;

                    const grid = document.createElement('div');
                    grid.className = 'mini-cards-grid';

                    plants.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0) || a.naam.localeCompare(b.naam));

                    plants.forEach(s => {
                        if (itemsInGroupDisplayed >= currentLimit) return;

                        const mini = document.createElement('div');
                        mini.className = 'mini-card';
                        mini.id = `garden-card-${s.id}`;
                        mini.innerHTML = `
                            <div class="mini-card-name">${s.isFavorite ? '⭐' : ''} ${s.naam}</div>
                            <div style="display:flex; gap:4px; align-items:center;">
                                <span class="badge ${s.type.toLowerCase()}" style="font-size:9px; padding:2px 6px;">${s.type}</span>
                                <span class="badge ${s.status.toLowerCase()}" style="font-size:9px; padding:2px 6px;">${getStatusLabel(s.status)}</span>
                            </div>
                        `;

                        mini.onclick = () => openDetailView(s);
                        grid.appendChild(mini);
                        itemsInGroupDisplayed++;
                    });
                    
                    group.appendChild(grid);

                    // Per-group toggles
                    if (plants.length > groupInitialLimit) {
                        const toggleBtn = document.createElement('button');
                        toggleBtn.className = 'btn-footer-toggle';
                        toggleBtn.style.display = 'block';
                        toggleBtn.style.margin = '12px auto 0';
                        
                        if (showAllGroup) {
                            toggleBtn.textContent = '▴ Minder weergeven';
                            toggleBtn.onclick = () => {
                                localStorage.setItem(`garden_group_${status.id}_show_all`, 'false');
                                renderHome();
                            };
                        } else {
                            const extra = plants.length - groupInitialLimit;
                            toggleBtn.textContent = `▾ Meer weergeven (${extra})`;
                            toggleBtn.onclick = () => {
                                localStorage.setItem(`garden_group_${status.id}_show_all`, 'true');
                                renderHome();
                            };
                        }
                        group.appendChild(toggleBtn);
                    }

                    groupedContainer.appendChild(group);
                });
            }
        }
        
        updateProgressUI();
    }

    // --- QUICK ACTION HELPERS (Global Access) ---
    window.updateQuickStatusById = async function (id, newStatus) {
        const seed = seeds.find(s => s.id === id);
        if (seed) {
            if (newStatus === 'Groeit') seed.fase_groeit = true;
            if (newStatus === 'Geoogst') seed.fase_geoogst = true;
            await updateQuickStatus(seed, newStatus);
        }
    };

    window.markAsSownById = async function (id) {
        const seed = seeds.find(s => s.id === id);
        if (seed) {
            seed.fase_gezaaid = true;
            seed.status = deriveMainStatus(seed);
            seed.lastSownYear = new Date().getFullYear();
            const months = getActiveMonths(seed);
            seed.sownLate = !months.has(new Date().getMonth());
            await saveSeed(seed);
            showToast(`${seed.naam} gemarkeerd als gezaaid! 🌱`);
            seeds = await getAllSeeds(); // Refresh local list
            renderHome(); // Refresh dashboard
        }
    };

    // --- Image Upload & Photo Hub Logic ---
    const fileUpload = document.getElementById('file-upload');
    const dropzoneWide = document.getElementById('dropzone-wide');

    if (dropzoneWide) {
        dropzoneWide.onclick = () => fileUpload?.click();

        dropzoneWide.ondragover = (e) => {
            e.preventDefault();
            dropzoneWide.classList.add('dragover');
        };
        dropzoneWide.ondragleave = () => {
            dropzoneWide.classList.remove('dragover');
        };
        dropzoneWide.ondrop = (e) => {
            e.preventDefault();
            dropzoneWide.classList.remove('dragover');
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        };

        window.addEventListener('paste', (e) => {
            const viewAdd = document.getElementById('view-add');
            if (!viewAdd || viewAdd.classList.contains('hidden')) return;
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const blob = items[i].getAsFile();
                    if (blob) handleFiles([blob]);
                }
            }
        });
    }

    if (fileUpload) {
        fileUpload.onchange = (e) => handleFiles(e.target.files);
    }

    function handleFiles(files) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (re) => {
                const url = re.target.result;
                if (!pendingImages.some(p => p.url === url)) {
                    pendingImages.push({ url: url, source: 'upload' });
                    if (!inputNaam.dataset.featuredUrl) {
                        inputNaam.dataset.featuredUrl = url;
                    }
                    renderUnifiedGallery();
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Reuse Pexels search but pipe to unified gallery
    const btnSearchPexelsUnified = document.getElementById('btn-search-pexels-unified');
    const inputSearchPexels = document.getElementById('pexels-search-input');

    if (btnSearchPexelsUnified && inputSearchPexels) {
        btnSearchPexelsUnified.addEventListener('click', async () => {
            const query = inputSearchPexels.value.trim();
            if (!query) return;
            btnSearchPexelsUnified.disabled = true;
            btnSearchPexelsUnified.textContent = "Zoeken...";
            const results = await searchPlantImage(query);
            if (results && results.length > 0) {
                photoSearchResults = results.map(r => ({ url: r.url, source: 'web', id: r.id }));
            }
            renderUnifiedGallery();
            btnSearchPexelsUnified.disabled = false;
            btnSearchPexelsUnified.textContent = "Zoek foto's 🔍";
        });
        inputSearchPexels.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); btnSearchPexelsUnified.click(); }
        });
    }

    // General Filters
    function applyFilters() {
        const q = searchInput.value.toLowerCase();
        let filtered = seeds;
        const currentMonth = new Date().getMonth();

        // 1. Filter by Category
        if (activeCategory !== 'Alles') {
            if (activeCategory === 'Gezaaid') {
                filtered = filtered.filter(s => s.status === 'Gezaaid' || s.status === 'Groeit');
            } else {
                filtered = filtered.filter(s => s.type === activeCategory);
            }
        }

        // 2. Filter by Month (activeMonthFilter)
        if (activeMonthFilter !== null) {
            filtered = filtered.filter(s => getActiveMonths(s).has(activeMonthFilter));
        }

        // 3. Search query
        if (q) {
            filtered = filtered.filter(s => s.naam.toLowerCase().includes(q));
        }

        renderSeeds(filtered);

        // Update sown count (always on the Gezaaid chip)
        const sownCount = document.getElementById('sown-count');
        if (sownCount) {
            const count = seeds.filter(s => s.status === 'Gezaaid' || s.status === 'Groeit').length;
            sownCount.textContent = count > 0 ? `(${count})` : '';
        }
    }

    window.clearMonthFilter = function () {
        activeMonthFilter = null;
        applyFilters();
    };

    searchInput.oninput = applyFilters;

    window._resetAllFilters = () => {
        activeCategory = 'Alles';
        activeMonthFilter = null;
        localStorage.removeItem('activeMonthFilter');
        if (searchInput) searchInput.value = '';
        
        // Reset filter chip UI
        document.querySelectorAll('.filter-chip').forEach(c => {
            c.classList.remove('active');
            if (c.textContent.includes('Alle Zaden')) c.classList.add('active');
        });
        
        applyFilters();
    };

    // Sowing Grid Overhaul
    async function renderSowingGrid() {
        const grid = document.getElementById('sowing-month-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        // Seasonal icons mapping
        const monthIcons = [
            '❄️', '❄️', '🌸', '🌸', '🌸', '☀️', '☀️', '☀️', '🍂', '🍂', '🍂', '❄️'
        ];

        for (let m = 0; m < 12; m++) {
            const count = seeds.filter(s => getActiveMonths(s).has(m)).length;

            // Robust check for reminders
            const hasReminders = (reminders || []).some(r => {
                if (!r.date) return false;
                const parts = r.date.split('-');
                if (parts.length < 3) return false;
                const ry = parseInt(parts[0]);
                const rm = parseInt(parts[1]) - 1;
                return rm === m && ry === currentYear;
            });

            const card = document.createElement('div');
            card.className = 'month-card';
            if (m === currentMonth) card.classList.add('current');
            if (count > 0) card.classList.add('has-items');

            const label = count === 0 ? 'Geen actie' : (count === 1 ? '1 plant' : `${count} planten`);
            const badge = m === currentMonth ? '<div class="month-badge">Nu</div>' : '';

            card.innerHTML = `
                ${badge}
                <div class="month-icon">${monthIcons[m]}</div>
                <div class="month-name">${calMonthNames[m]}</div>
                ${count > 0 ? `<div class="month-indicator-badge">🌱 ${count}</div>` : '<div class="month-count">Geen actie</div>'}
            `;

            card.onclick = () => openPlannerMonthModal(m);
            grid.appendChild(card);
        }
    }

    const plannerSeasonalAdvice = [
        { title: "Januari - Winterrust en planning", sub: "Maak je tuinplan en bestel je zaden voor het nieuwe jaar", focus: "Plannen en zaden inventariseren", alert: "Bescherm kranen en planten tegen strenge vorst", tip: "Maak een schets van je wisselteelt", icon: "❄️" },
        { title: "Februari - De eerste kriebels", sub: "De eerste zaden kunnen binnen onder glas worden gezaaid", focus: "Voorbereiden van kweekbakken", alert: "Pas op voor te natte grond in de moestuin", tip: "Begin met pepers en paprika's (lange kiem)", icon: "🌱" },
        { title: "Maart - De lente ontwaakt", sub: "Veel zaden kunnen nu direct de volle grond in", focus: "Bodem verbeteren met compost", alert: "Houd rekening met plotselinge nachtvorst", tip: "Zaai doperwten en peultjes direct buiten", icon: "🌸" },
        { title: "April - Drukke zaaimaand", sub: "Tijd voor voorzaaien, afharden en de eerste snelle groeiers", focus: "Voorzaaien van zomergroenten", alert: "Slakken worden nu ook weer actief", tip: "Denk aan klimrekken voor je komkommers", icon: "☀️" },
        { title: "Mei - Na de IJsheiligen", sub: "Alles mag nu eindelijk veilig naar buiten", focus: "Planten uitplanten in de volle grond", alert: "Zorg voor voldoende water bij droge dagen", tip: "Zet tomaten en courgettes op hun plek", icon: "🏡" },
        { title: "Juni - Groei en bloei", sub: "Houd de tuin bij en geniet van de eerste oogst", focus: "Watergeven en onkruid wieden", alert: "Valse meeldauw bij aardappelen", tip: "Mulch de bodem om vocht vast te houden", icon: "🌿" },
        { title: "Juli - Oogsttijd", sub: "Blijf oogsten voor meer groei", focus: "Oogsten en bewaren van groenten", alert: "Tomatenplanten kunnen last krijgen van neusrot", tip: "Zaai nu herfstspinazie en boerenkool", icon: "🥗" },
        { title: "Augustus - Nazomeren", sub: "Geniet van de overvloed en win je eigen zaden", focus: "Zaden oogsten voor volgend jaar", alert: "Witte vlieg houdt van warm weer", tip: "Verwijder overtollig blad bij tomaten", icon: "☀️" },
        { title: "September - Herfst voorbereiden", sub: "Tijd om de tuin klaar te maken voor najaar", focus: "Laatste zomeroogst binnenhalen", alert: "Schimmelgroei door hoge vochtigheid", tip: "Plant nu knoflook voor volgend jaar", icon: "🍂" },
        { title: "Oktober - De tuin vertraagt", sub: "Ruim op waar nodig, maar laat ook wat natuur liggen", focus: "Opruimen en composteren", alert: "Eerste nachtvorst kan bloeiers raken", tip: "Plant nu je voorjaarsbollen", icon: "🍄" },
        { title: "November - Grondbewerking", sub: "Bedek de bodem en maak je gereedschap schoon", focus: "Winterklaar maken van de borders", alert: "Buitenkranen afsluiten tegen vorst", tip: "Laat uitgebloeide stengels staan", icon: "🌧️" },
        { title: "December - Winterrust", sub: "Reflecteer op het jaar en plan alvast vooruit", focus: "Gereedschap onderhoud en olie", alert: "Sneeuwdruk op structuren", tip: "Vergeet de vogels niet bij te voeren", icon: "❄️" }
    ];

    function openPlannerMonthModal(mIndex) {
        const modal = document.getElementById('planner-month-modal');
        const title = document.getElementById('planner-month-title');
        const subtitle = document.getElementById('planner-month-subtitle');
        const icon = document.getElementById('planner-month-header-icon');
        const focusText = document.getElementById('planner-focus-text');
        const alertText = document.getElementById('planner-alert-text');
        const tipText = document.getElementById('planner-tip-text');
        const list = document.getElementById('planner-seeds-list');
        const count = document.getElementById('planner-seeds-count');
        const focusIcon = document.getElementById('planner-focus-icon');

        if (!modal) return;

        const advice = plannerSeasonalAdvice[mIndex];
        title.textContent = advice.title;
        subtitle.textContent = advice.sub;
        icon.textContent = advice.icon;
        focusText.textContent = advice.focus;
        alertText.textContent = advice.alert;
        tipText.textContent = advice.tip;
        focusIcon.textContent = advice.icon;

        const plants = seeds.filter(s => getActiveMonths(s).has(mIndex));
        count.textContent = `${plants.length} planten`;

        list.innerHTML = '';
        if (plants.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:20px; color:#999; font-size:13px;">Geen zaaiplannen voor deze maand.</p>';
        } else {
            plants.sort((a, b) => a.naam.localeCompare(b.naam)).forEach(p => {
                const item = document.createElement('div');
                item.className = 'planner-seed-item';
                item.innerHTML = `
                    <div class="planner-seed-info">
                        <div class="planner-seed-name">${p.naam}</div>
                        <div style="display:flex; gap:4px; margin-top:2px;">
                            <span class="badge ${p.type.toLowerCase()}" style="font-size:9px; padding:1px 6px; font-weight:700;">${p.type}</span>
                            <span class="badge ${p.status.toLowerCase()}" style="font-size:9px; padding:1px 6px; opacity:0.8;">${getStatusLabel(p.status)}</span>
                        </div>
                    </div>
                `;
                item.onclick = () => { closePlannerModal(); openDetailView(p); };
                list.appendChild(item);
            });
        }

        modal.classList.remove('hidden');

        // Update footer CTA
        const footer = modal.querySelector('.planner-modal-footer');
        if (footer) {
            // Remove old CTAs to avoid duplicates
            footer.innerHTML = '';

            const ctaCalendar = document.createElement('button');
            ctaCalendar.className = 'planner-btn-primary btn-goto-calendar';
            ctaCalendar.innerHTML = `Bekijk Kalender 🗓️`;
            ctaCalendar.onclick = () => {
                const currentYear = new Date().getFullYear();
                curCalDate = new Date(currentYear, mIndex, 1);
                closePlannerModal();
                switchView('calendar');
                renderCalendar();
            };
            footer.appendChild(ctaCalendar);

            const ctaSeeds = document.createElement('button');
            ctaSeeds.className = 'planner-btn-secondary';
            ctaSeeds.innerHTML = `Bekijk Zaden 📦`;
            ctaSeeds.onclick = () => {
                localStorage.setItem('activeMonthFilter', calMonthNames[mIndex]);
                closePlannerModal();
                switchView('list');
            };
            footer.appendChild(ctaSeeds);

            // ctaClose removed based on user request
        }
    }

    const closePlannerModal = () => {
        document.getElementById('planner-month-modal')?.classList.add('hidden');
    };
    window.closePlannerModal = closePlannerModal;

    window.viewAllSeedsFromPlanner = () => {
        closePlannerModal();
        switchView('list');
    };


    // Form logic simple
    seedForm.onsubmit = async (e) => { 
        e.preventDefault(); 
        await saveCurrentForm(); 
        switchView('list'); 
    };

    // Initial load
    // FAQ Toggle
    window.toggleFAQ = function(element) {
        element.classList.toggle('open');
    };

    // Info Modal Logic

    // Data Bridge Functions
    window.closeInfoModal = function() {
        document.getElementById('info-modal')?.classList.add('hidden');
    };

    // --- DATA MANAGEMENT LOGIC ---
    window.exportData = async function() {
        try {
            const data = await getAllSeeds();
            const fullBackup = {
                seeds: data,
                calendar: JSON.parse(localStorage.getItem('moestuin_calendar')) || {},
                wishlist: JSON.parse(localStorage.getItem('moestuin_wishlist')) || [],
                settings: JSON.parse(localStorage.getItem('moestuin_settings')) || {},
                userProfile: JSON.parse(localStorage.getItem('userProfile')) || JSON.parse(localStorage.getItem('moestuin_user_profile')) || {},
                reminders: JSON.parse(localStorage.getItem('moestuin_reminders')) || [],
                dailyProgress: JSON.parse(localStorage.getItem('daily_progress')) || {},
                theme: localStorage.getItem('theme') || 'dark',
                onboardingDone: localStorage.getItem('onboarding_done') || 'false',
                uiState: {}
            };

            // Collect dynamic UI states and preferences
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('dashboard_nu_doen_expanded_') || 
                    key.startsWith('garden_group_') || 
                    [
                        'expanded_extra-section', 
                        'activeMonthFilter', 
                        'layout_width', 
                        'onboarding_sun', 
                        'onboarding_type', 
                        'onboarding_level'
                    ].includes(key)) {
                    fullBackup.uiState[key] = localStorage.getItem(key);
                }
            }

            const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `moestuin-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast("Backup gedownload! 📥");
        } catch (err) {
            console.error(err);
            showToast("Export mislukt ❌");
        }
    };

    window.importData = function() {
        const input = document.getElementById('import-file');
        if (input) {
            input.click();
        }
    };
    window.restoreBackup = window.importData;


    window.resetApp = function() {
        if (confirm("WEET JE HET ZEKER? Dit verwijdert alle zaden en instellingen. Dit kan niet ongedaan worden.")) {
            localStorage.clear();
            const request = indexedDB.deleteDatabase("MoestuinDB");
            request.onsuccess = () => {
                showToast("App gereset. Herstarten...");
                setTimeout(() => location.reload(), 1500);
            };
        }
    };

    const inputImportRelocated = document.getElementById('import-file');
    if (inputImportRelocated) {
        inputImportRelocated.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = async (evt) => {
                try {
                    const imported = JSON.parse(evt.target.result);
                    let count = 0;
                    const seedsToImport = Array.isArray(imported) ? imported : (imported.seeds || []);
                    for (const s of seedsToImport) { await saveSeed(s); count++; }

                    if (imported.calendar) localStorage.setItem('moestuin_calendar', JSON.stringify(imported.calendar));
                    if (imported.wishlist) localStorage.setItem('moestuin_wishlist', JSON.stringify(imported.wishlist));
                    if (imported.settings) localStorage.setItem('moestuin_settings', JSON.stringify(imported.settings));
                    
                    // Nieuwe velden herstellen
                    if (imported.userProfile) {
                        localStorage.setItem('userProfile', JSON.stringify(imported.userProfile));
                        localStorage.setItem('moestuin_user_profile', JSON.stringify(imported.userProfile));
                    }
                    if (imported.reminders) localStorage.setItem('moestuin_reminders', JSON.stringify(imported.reminders));
                    if (imported.dailyProgress) localStorage.setItem('daily_progress', JSON.stringify(imported.dailyProgress));
                    if (imported.theme) localStorage.setItem('theme', imported.theme);
                    if (imported.onboardingDone) localStorage.setItem('onboarding_done', imported.onboardingDone);

                    // Herstel UI state en overige voorkeuren
                    if (imported.uiState) {
                        for (const key in imported.uiState) {
                            localStorage.setItem(key, imported.uiState[key]);
                        }
                    }

                    showToast(`${count} zaden en alle instellingen hersteld! 🌿`);

                    setTimeout(() => location.reload(), 1500);
                } catch (err) { alert("Ongeldig bestand!"); console.error(err); }
                inputImportRelocated.value = '';
            };
            r.readAsText(file);
        };
    }

    // --- WISHLIST LOGIC (Redesigned) ---

    let wishlist = JSON.parse(localStorage.getItem('moestuin_wishlist')) || [];
    let editingWishId = null;
    let activeWishFilter = 'all';

    const bekendeZaden = [
        'tomaat', 'sla', 'courgette', 'pompoen', 'wortel', 'boon', 'erwt', 'radijs', 
        'paprika', 'peper', 'spinazie', 'kool', 'ui', 'knoflook', 'prei', 'biet', 
        'aardappel', 'aardbei', 'framboos', 'bes', 'munt', 'rozemarijn', 'tijm', 
        'peterselie', 'basilicum', 'komkommer', 'augurk', 'melano', 'aubergine',
        'bloemkool', 'broccoli', 'spruitjes', 'boerenkool', 'rode kool', 'witte kool',
        'savooiekool', 'andijvie', 'rucola', 'veldsla', 'raapsteel', 'postelein',
        'venkel', 'selderij', 'pastinaak', 'schorseneer', 'rammenas', 'koolrabi',
        'tuinboon', 'peul', 'kapucijner', 'snijboon', 'sperzieboon', 'pronkboon',
        'mais', 'zonnebloem', 'goudsbloem', 'oost-indische kers', 'lavendel'
    ];

    function detectWishType(name) {
        const lower = name.toLowerCase();
        // Check if it's in our known list or ends with 'zaad' or 'zaden'
        if (bekendeZaden.some(z => lower.includes(z)) || lower.includes('zaad') || lower.includes('zaden')) {
            return 'seed';
        }
        return 'item';
    }

    function renderWishlist() {
        const container = document.getElementById('wishlist-items');
        const emptyState = document.getElementById('wishlist-empty-state');
        const fastAdd = document.getElementById('wishlist-fast-add');
        if (!container) return;

        // 7.1 Empty state logic
        if (wishlist.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            if (fastAdd) fastAdd.classList.add('hidden');
            return;
        } else {
            if (emptyState) emptyState.classList.add('hidden');
            if (fastAdd) fastAdd.classList.remove('hidden');
        }

        // 7.2 Filtering logic
        const filtered = wishlist.filter(item => {
            if (activeWishFilter === 'all') return true;
            return item.type === activeWishFilter;
        });

        container.innerHTML = filtered.length === 0
            ? `<p class="wishlist-empty-msg" style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 14px; opacity: 0.7;">Niets gevonden in deze categorie. ✨</p>`
            : '';

        filtered.forEach(item => {
            const el = document.createElement('div');
            el.className = 'wish-item-card';

            const thumbSrc = item.image || '';
            const thumbContent = thumbSrc
                ? `<img src="${thumbSrc}" alt="${item.name}" loading="lazy">`
                : `<span class="wish-img-placeholder">${item.type === 'item' ? '📦' : '🌱'}</span>`;

            el.innerHTML = `
                <div class="wish-img-box">${thumbContent}</div>
                <div class="wish-content-box" style="flex: 1;">
                    <div style="display: flex; flex-direction: column;">
                        <h4 class="wish-title">${item.name}</h4>
                        <div style="display:flex; gap: 4px; align-items:center; margin-top: 4px;">
                            <span class="badge ${item.type === 'seed' ? 'groente' : 'overige'}" style="font-size: 10px; padding: 2px 10px; border-radius: 6px; border:none; background: ${item.type === 'seed' ? 'rgba(95, 122, 97, 0.1)' : 'rgba(0,0,0,0.05)'}; font-weight: 700;">${item.type === 'seed' ? 'Zaad' : 'Item'}</span>
                        </div>
                    </div>
                </div>
                <div class="wish-card-actions">
                    ${item.type === 'seed' ? `<button class="btn-convert-seed" onclick="event.stopPropagation(); window._convertToSeed('${item.id}', this)">Naar zaden</button>` : ''}
                    ${(item.link && item.link.startsWith('http')) ? `<button class="btn-wish-icon" onclick="event.stopPropagation(); window.open('${item.link}', '_blank')" title="Bekijk online">🔗</button>` : ''}
                    <button class="btn-wish-icon" onclick="event.stopPropagation(); window._editWish('${item.id}')" title="Bewerk">✏️</button>
                    <button class="btn-wish-icon" onclick="event.stopPropagation(); window._deleteWish('${item.id}')" title="Verwijder">🗑️</button>
                </div>
            `;

            el.onclick = () => openWishModal(item.id);
            container.appendChild(el);
        });
    }

    // Wishlist Tab handling (7.2)
    document.querySelectorAll('[data-wish-filter]').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('[data-wish-filter]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeWishFilter = tab.dataset.wishFilter;
            renderWishlist();
        };
    });

    // Exposed Helpers for Wishlist Cards
    window._deleteWish = (id) => {
        if (confirm('Weet je zeker dat je dit item wilt verwijderen?')) {
            wishlist = wishlist.filter(item => String(item.id) !== String(id));
            saveWish();
        }
    };

    window._editWish = (id) => {
        openWishModal(id);
    };

    window._convertToSeed = async (id, btn) => {
        const item = wishlist.find(i => String(i.id) === String(id));
        if (!item || (btn && btn.disabled)) return;

        // Duplicate check before converting
        const exists = seeds.some(s => s.naam.toLowerCase() === item.name.toLowerCase());
        if (exists) {
            showToast("Staat al in je tuin 🌿");
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Bezig...';
        }

        const newSeed = {
            id: Date.now().toString(),
            naam: item.name,
            type: 'Overig', // Default
            standplaats: 'Zon',
            water: 'Gemiddeld',
            status: 'Voorraad',
            zaaitijd: '',
            oogsttijd: '',
            ervaringScore: 0,
            beschrijving: item.note || '',
            ervaringen: '',
            images: item.image ? [{ url: item.image, source: 'wishlist' }] : [],
            tags: [],
            featuredImageUrl: item.image || '',
            isFavorite: false
        };

        // Try to enrich from mockData
        const lowerName = item.name.toLowerCase();
        for (let key in mockData) {
            if (lowerName.includes(key)) {
                newSeed.type = mockData[key].type;
                newSeed.standplaats = mockData[key].standplaats;
                newSeed.water = mockData[key].water;
                newSeed.zaaitijd = mockData[key].zaaitijd;
                newSeed.oogsttijd = mockData[key].oogsttijd;
                newSeed.tags = mockData[key].tags || [];
                break;
            }
        }

        await saveSeed(newSeed);
        seeds = await getAllSeeds();
        
        // Remove from wishlist
        wishlist = wishlist.filter(i => String(i.id) !== String(id));
        saveWish();
        
        showToast("Toegevoegd aan je zaden 🌱");
        if (!viewList.classList.contains('hidden')) applyFilters();
    };

    function saveWish() {
        localStorage.setItem('moestuin_wishlist', JSON.stringify(wishlist));
        renderWishlist();
    }

    // Modal management
    const wishModal = document.getElementById('wishlist-detail-modal');
    const wishInputQuick = document.getElementById('wishlist-quick-input');
    const btnAddWishQuick = document.getElementById('btn-add-wish-quick');

    function openWishModal(id) {
        editingWishId = id;


        const item = wishlist.find(i => String(i.id) === String(id));
        if (!item) {
            console.warn("Item not found for ID:", id);
            return;
        }

        document.getElementById('edit-wish-name').value = item.name || '';
        document.getElementById('edit-wish-type').value = item.type || 'seed';
        document.getElementById('edit-wish-link').value = item.link || '';
        document.getElementById('edit-wish-img-url').value = item.image && item.image.startsWith('http') ? item.image : '';
        document.getElementById('edit-wish-note').value = item.note || '';

        delete wishModal.dataset.tempPastedImg;
        updateWishImgPreview(item.image);
        updateVisitLink(item.link);

        wishModal.classList.remove('hidden');
    }

    function closeWishModal() {
        wishModal.classList.add('hidden');
        editingWishId = null;
    }

    function updateWishImgPreview(src) {
        const preview = document.getElementById('edit-wish-img-preview');
        const placeholder = document.getElementById('wish-img-placeholder');
        if (!preview || !placeholder) return;

        const isValid = src && (src.startsWith('http') || src.startsWith('data:image'));
        if (isValid) {
            preview.src = src;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            preview.style.display = 'none';
            placeholder.style.display = 'block';
        }
    }

    function updateVisitLink(url) {
        const btn = document.getElementById('btn-visit-link');
        if (!btn) return;
        if (url && url.startsWith('http')) {
            btn.href = url;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        } else {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        }
    }

    // Event Listeners
    if (btnAddWishQuick && wishInputQuick) {
        const handleAdd = (inputEl) => {
            const val = inputEl.value.trim();
            if (!val) {
                // UX Pass: Shake if empty
                inputEl.classList.add('shake-input');
                setTimeout(() => inputEl.classList.remove('shake-input'), 400);
                return;
            }

            const newItem = {
                id: Date.now().toString(),
                name: val,
                link: '',
                image: '',
                note: '',
                type: detectWishType(val),
                bought: false
            };
            wishlist.unshift(newItem); // Add to top
            saveWish();
            inputEl.value = '';

            // UX Pass: Feedback
            if (inputEl.id === 'wishlist-quick-input') {
                inputEl.focus();
                // Subtiele flash feedback op input
                const originalBg = inputEl.style.background;
                inputEl.style.background = '#F0FDF4'; 
                setTimeout(() => { inputEl.style.background = originalBg; }, 300);
            } else {
                switchView('wishlist'); // Ensure view is updated if added from empty state
            }
        };

        btnAddWishQuick.onclick = () => handleAdd(wishInputQuick);
        wishInputQuick.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(wishInputQuick); };

        const btnAddWishEmpty = document.getElementById('btn-add-wish-empty');
        const wishInputEmpty = document.getElementById('wishlist-empty-input');
        if (btnAddWishEmpty && wishInputEmpty) {
            btnAddWishEmpty.onclick = () => handleAdd(wishInputEmpty);
            wishInputEmpty.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(wishInputEmpty); };
        }
    }

    // --- PASTE SUPPORT (Ctrl+V) ---
    wishModal?.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.match(/^image\//)) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = event.target.result;
                    document.getElementById('edit-wish-img-url').value = 'Pasted Image';
                    updateWishImgPreview(base64);
                    // Temporarily store in a way the save button can pick up
                    wishModal.dataset.tempPastedImg = base64;
                    showToast("Afbeelding geplakt! 📸");
                };
                reader.readAsDataURL(blob);
            }
        }
    });

    document.getElementById('btn-close-wish-modal')?.addEventListener('click', closeWishModal);

    // Close on click outside
    wishModal?.addEventListener('click', (e) => {
        if (e.target === wishModal) closeWishModal();
    });

    // Close on ESC
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !wishModal.classList.contains('hidden')) {
            closeWishModal();
        }
    });

    document.getElementById('btn-wish-save')?.addEventListener('click', () => {
        if (!editingWishId) return;
        const index = wishlist.findIndex(i => i.id === editingWishId);
        if (index === -1) return;

        wishlist[index].name = document.getElementById('edit-wish-name').value;
        wishlist[index].type = document.getElementById('edit-wish-type').value;
        wishlist[index].link = document.getElementById('edit-wish-link').value;
        wishlist[index].note = document.getElementById('edit-wish-note').value;

        const imgUrlField = document.getElementById('edit-wish-img-url');
        const imgUrl = imgUrlField.value;

        if (wishModal.dataset.tempPastedImg && imgUrl === 'Pasted Image') {
            wishlist[index].image = wishModal.dataset.tempPastedImg;
        } else if (imgUrl && imgUrl.startsWith('http')) {
            wishlist[index].image = imgUrl;
        }

        delete wishModal.dataset.tempPastedImg;
        saveWish();
        closeWishModal();
    });

    document.getElementById('btn-wish-delete')?.addEventListener('click', (e) => {
        e.preventDefault();


        if (!editingWishId) return;

        if (confirm('Weet je zeker dat je dit item wilt verwijderen?')) {
            const targetId = String(editingWishId);
            wishlist = wishlist.filter(item => String(item.id) !== targetId);

            localStorage.setItem('moestuin_wishlist', JSON.stringify(wishlist));
            renderWishlist();
            closeWishModal();
        }
    });

    document.getElementById('edit-wish-link')?.addEventListener('input', (e) => {
        updateVisitLink(e.target.value);
    });

    document.getElementById('edit-wish-img-url')?.addEventListener('input', (e) => {
        updateWishImgPreview(e.target.value);
    });

    document.getElementById('edit-wish-img-file')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            updateWishImgPreview(base64);
            if (editingWishId) {
                const index = wishlist.findIndex(i => i.id === editingWishId);
                if (index !== -1) wishlist[index].image = base64;
            }
        };
        reader.readAsDataURL(file);
    });

    // --- STANDALONE CALENDAR LOGIC (Minimalist) ---
    // State moved to top for dashboard access

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const title = document.getElementById('cal-month-title');
        const tipsBadge = document.getElementById('btn-cal-sow-tips');
        if (!grid) return;

        grid.innerHTML = '';
        const y = curCalDate.getFullYear(), m = curCalDate.getMonth();
        title.textContent = `${calMonthNames[m]} ${y}`;

        // Update badge
        if (tipsBadge) {
            const plants = seeds.filter(s => getActiveMonths(s).has(m));
            if (plants.length > 0) {
                tipsBadge.classList.remove('hidden');
                tipsBadge.onclick = (e) => {
                    e.stopPropagation();
                    openPlannerMonthModal(m);
                };
            } else {
                tipsBadge.classList.add('hidden');
            }
        }

        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const offset = (firstDay === 0 ? 7 : firstDay) - 1;

        for (let i = 0; i < offset; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day other-month';
            grid.appendChild(empty);
        }

        const today = new Date();
        const todayStr = formatDate(today);

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayReminders = reminders.filter(r => r.date === dateStr);

            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            if (dateStr === todayStr) dayEl.classList.add('today');
            if (dateStr === selectedDateStr) dayEl.classList.add('selected');

            dayEl.innerHTML = `<span class="day-num">${d}</span>`;

            dayEl.innerHTML = `<span class="day-num">${d}</span>`;

            dayEl.innerHTML = `<span class="day-num">${d}</span>`;

            if (dayReminders.length > 0) {
                const count = dayReminders.length;
                let pillsHtml = '<div class="cal-pills-container">';
                const visibleCount = Math.min(count, 2);
                
                for (let j = 0; j < visibleCount; j++) {
                    const r = dayReminders[j];
                    // Clean label: take first word or max 10 chars
                    let label = r.title.split(' ')[0];
                    if (label.length > 10) label = label.substring(0, 9) + '…';
                    
                    pillsHtml += `<div class="cal-reminder-pill">${label}</div>`;
                }
                
                if (count > 2) {
                    pillsHtml += `<div class="cal-pill-more">+${count - 2}</div>`;
                }
                pillsHtml += '</div>';
                dayEl.innerHTML += pillsHtml;
            }

            dayEl.onclick = () => selectDay(dateStr, d);
            grid.appendChild(dayEl);
        }
    }

    function formatDate(date) {
        const d = date.getDate();
        const m = date.getMonth() + 1;
        const y = date.getFullYear();
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }



    function selectDay(dateStr, d) {
        selectedDateStr = dateStr;
        const panel = document.getElementById('day-details');
        const label = document.getElementById('selected-date-label');
        const contextLine = document.getElementById('reminder-context-line');
        if (!panel || !label) return;

        panel.classList.remove('hidden');
        const monthName = calMonthNames[curCalDate.getMonth()];
        const year = curCalDate.getFullYear();
        
        label.innerHTML = `📅 ${d} ${monthName} ${year}`;
        
        if (contextLine) {
            contextLine.className = 'day-context-line'; // Match CSS
            contextLine.innerHTML = `Details op ${d} ${monthName.toLowerCase()} · <span id="btn-change-day">Wijzigen</span>`;
            document.getElementById('btn-change-day').onclick = (e) => {
                e.stopPropagation();
                panel.classList.add('hidden');
                selectedDateStr = null;
                renderCalendar();
            };
        }

        renderReminderList(dateStr);
        renderCalendar();

        const input = document.getElementById('new-reminder-input');
        if (input) {
            input.focus();
            // Enter key support for UX
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('btn-add-reminder')?.click();
                }
            };
        }
    }

    function renderReminderList(dateStr) {
        const container = document.getElementById('reminder-list');
        if (!container) return;

        const dayItems = reminders.filter(r => r.date === dateStr);
        container.innerHTML = dayItems.length === 0
            ? '<p style="color:var(--text-muted); font-size:14px; text-align:center; padding:20px; opacity:0.6;">Rustige dag vandaag.</p>'
            : '';

        dayItems.sort((a, b) => a.id - b.id).forEach(item => {
            const el = document.createElement('div');
            el.className = `reminder-row ${item.done ? 'done' : ''}`;
            el.innerHTML = `
                <div class="reminder-check-col">
                  <div class="custom-checkbox ${item.done ? 'active' : ''}"></div>
                </div>
                <div class="reminder-text-col">
                  <span>${item.title}</span>
                </div>
                <div class="reminder-actions-col">
                  <button class="btn-delete-reminder" title="Verwijder">×</button>
                </div>
            `;

            el.querySelector('.custom-checkbox').onclick = (e) => {
                e.stopPropagation();
                item.done = !item.done;
                saveReminders();
                renderReminderList(dateStr);
                renderCalendar();
            };

            el.querySelector('.btn-delete-reminder').onclick = (e) => {
                e.stopPropagation();
                reminders = reminders.filter(r => r.id !== item.id);
                saveReminders();
                renderReminderList(dateStr);
                renderCalendar();
            };

            container.appendChild(el);
        });
    }

    // saveReminders moved to top for dashboard access


    const btnCalPrev = document.getElementById('cal-prev');
    const btnCalNext = document.getElementById('cal-next');
    if (btnCalPrev) btnCalPrev.onclick = () => { curCalDate.setMonth(curCalDate.getMonth() - 1); renderCalendar(); };
    if (btnCalNext) btnCalNext.onclick = () => { curCalDate.setMonth(curCalDate.getMonth() + 1); renderCalendar(); };

    const btnAddReminder = document.getElementById('btn-add-reminder');
    const reminderInput = document.getElementById('new-reminder-input');

    const handleAdd = () => {
        if (!selectedDateStr) return;
        const val = reminderInput.value.trim();
        if (!val) return;
        reminders.push({ id: Date.now(), date: selectedDateStr, title: val, done: false });
        saveReminders();
        reminderInput.value = '';
        renderReminderList(selectedDateStr);
        renderCalendar();
        reminderInput.focus();
    };

    if (btnAddReminder) btnAddReminder.onclick = handleAdd;
    if (reminderInput) {
        reminderInput.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(); };
    }

    const btnCloseDetails = document.getElementById('btn-close-details');
    if (btnCloseDetails) {
        btnCloseDetails.onclick = () => {
            document.getElementById('day-details')?.classList.add('hidden');
            selectedDateStr = null;
            renderCalendar();
        };
    }

    const btnFab = document.getElementById('btn-add-event-fab');
    if (btnFab) {
        btnFab.onclick = () => {
            if (viewCalendar.classList.contains('hidden')) {
                switchView('calendar');
            }
            if (!selectedDateStr) {
                const today = new Date();
                curCalDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                selectDay(formatDate(today), today.getDate());
            } else {
                document.getElementById('new-reminder-input')?.focus();
            }
        };
    }

    // Delete seed from form
    // Dashboard Tips link
    const btnHomeTips = document.getElementById('btn-home-tips');
    if (btnHomeTips) {
        btnHomeTips.onclick = (e) => {
            e.stopPropagation();
            const currentMonth = new Date().getMonth();
            window.openPlannerMonthModal(currentMonth);
        };
    }

    window.deleteCurrentSeed = async function() {
        if (!editingId) return;
        if (confirm("Weet je zeker dat je dit zaadje wilt verwijderen?")) {
            try {
                await deleteSeedDB(editingId);
                seeds = await getAllSeeds();
                showToast("Zaadje verwijderd! 🗑️");
                switchView('list');
            } catch (err) {
                console.error("Delete failed", err);
                showToast("Verwijderen mislukt ❌");
            }
        }
    };

    const btnFormDelete = document.getElementById('btn-form-delete');
    if (btnFormDelete) {
        btnFormDelete.onclick = window.deleteCurrentSeed;
    }



    function updateTagsSummary() {
        const summary = document.getElementById('tags-summary');
        if (!summary) return;
        const count = document.querySelectorAll('.tag-picker-chip.active').length;
        summary.textContent = count > 0 ? `${count} tag${count === 1 ? '' : 's'} geselecteerd` : 'Kies kenmerken en gebruik';
    }

    // Tag Picker Init
    function renderTagPicker(selectedNames = []) {
        const p = document.getElementById('tag-picker');
        if (!p) return;
        p.innerHTML = '';
        
        const selLow = selectedNames.map(s => s.toLowerCase());
        const allPredefined = [];
        
        tagCategoryOrder.forEach(cat => {
            const g = document.createElement('div');
            g.innerHTML = `<h5>${cat}</h5><div class="tag-picker-list"></div>`;
            tagCategories[cat].forEach(t => {
                const lowerT = t.toLowerCase();
                allPredefined.push(lowerT);
                const chip = document.createElement('div');
                chip.className = `tag-picker-chip ${selLow.includes(lowerT) ? 'active' : ''}`;
                chip.textContent = t;
                chip.dataset.tag = t;
                chip.onclick = () => {
                    chip.classList.toggle('active');
                    updateTagsSummary();
                };
                g.querySelector('.tag-picker-list').appendChild(chip);
            });
            p.appendChild(g);
        });

        updateTagsSummary();
    }

    // Convert month indices to readable ranges (e.g. [2,3,4,8,9] -> "Mrt – Mei, Sep – Okt")
    function formatMonthRanges(months) {
        if (!months) return '';
        const sorted = Array.from(months).sort((a, b) => a - b);
        if (sorted.length === 0) return '';
        if (sorted.length === 12) return 'Hele jaar door';

        const ranges = [];
        let start = sorted[0];
        let prev = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === prev + 1) {
                prev = sorted[i];
            } else {
                ranges.push([start, prev]);
                start = sorted[i];
                prev = sorted[i];
            }
        }
        ranges.push([start, prev]);

        return ranges.map(([s, e]) => {
            return s === e ? monthNamesShort[s] : `${monthNamesShort[s]} - ${monthNamesShort[e]}`;
        }).join(', ');
    }

    // Small helper for month recognition
    function getActiveMonths(valueOrSeed) {
        let value = valueOrSeed;
        // If a seed object is passed, automatically pick the best sowing months field
        if (valueOrSeed && typeof valueOrSeed === 'object' && !Array.isArray(valueOrSeed)) {
            value = valueOrSeed.zaaitijd || valueOrSeed.sowingMonths || valueOrSeed.zaaiTijd || valueOrSeed.sowMonths;
        }

        let active = new Set();
        if (!value) return active;

        // Common month abbreviations and their index
        const mMap = { 
            'jan': 0, 'feb': 1, 'mrt': 2, 'mar': 2, 'maa': 2, 'apr': 3, 
            'mei': 4, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 
            'sep': 8, 'okt': 9, 'oct': 9, 'nov': 10, 'dec': 11 
        };

        // Support array of numbers or strings
        if (Array.isArray(value)) {
            value.forEach(v => {
                if (typeof v === 'number') {
                    if (v >= 0 && v <= 11) active.add(v);
                    else if (v >= 1 && v <= 12) active.add(v - 1);
                } else if (typeof v === 'string') {
                    const cleanV = v.toLowerCase().substring(0, 3);
                    if (mMap[cleanV] !== undefined) active.add(mMap[cleanV]);
                }
            });
            return active;
        }

        const text = value.toString().toLowerCase();
        if (text.includes('jaar door')) { for (let i = 0; i < 12; i++) active.add(i); return active; }

        // --- RANGE DETECTION ---
        const rangeParts = text.split(/[-–]| tot /);
        if (rangeParts.length === 2) {
            let startIdx = -1;
            let endIdx = -1;

            Object.keys(mMap).forEach(k => {
                if (rangeParts[0].includes(k)) startIdx = mMap[k];
                if (rangeParts[1].includes(k)) endIdx = mMap[k];
            });

            if (startIdx !== -1 && endIdx !== -1) {
                // Determine loop direction (handling Dec-Jan wrap-around)
                if (startIdx <= endIdx) {
                    for (let i = startIdx; i <= endIdx; i++) active.add(i);
                } else {
                    for (let i = startIdx; i <= 11; i++) active.add(i);
                    for (let i = 0; i <= endIdx; i++) active.add(i);
                }
                return active;
            }
        }

        Object.keys(mMap).forEach(k => { 
            if (text.includes(k)) active.add(mMap[k]); 
        });

        // Robust numeric check (e.g. "1, 2, 3" or 0-indexed values)
        const nums = text.match(/\d+/g);
        if (nums) {
            nums.forEach(n => {
                const val = parseInt(n);
                // Assume 1-12 for text strings
                if (val >= 1 && val <= 12) active.add(val - 1);
            });
        }
        return active;
    }

    renderTagPicker();

    // --- AI CONFIGURATIE (HYBRIDE ROUTE: LOKAAL OF ONLINE) ---
    async function vraagAI(mode, input = '', month = '') {
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        
        // --- PROMPT REGISTRY ---
        let prompt = "";
        const contextNL = "Je bent een nuchtere, ervaren Nederlandse moestuin-expert. Context: Gematigd zeeklimaat, klei/zandgrond. Geef praktisch advies.";

        if (mode === "fill_seed_info") {
            prompt = `Analyseer de plant '${input}'. Gebruik de maand ${month} als referentiekader. ${contextNL}
            Geef EXACT deze JSON structuur terug:
            {
              "type": "Groente|Fruit|Kruid|Bloem|Bloembol|Boom|Struik|Sierplant",
              "standplaats": "Zon|Halfschaduw|Schaduw",
              "waterbehoefte": "Laag|Gemiddeld|Hoog",
              "zaaitijd": ["jan", "feb", "etc"],
              "oogsttijd": ["mei", "jun", "etc"],
              "tags": ["minstens 5-8 diverse tags zoals: Beginner, Winterhard, Bijvriendelijk, Snelle groeier, etc"],
              "teeltinformatie": "Verplicht veld! Geef 2-3 concrete zinnen met praktisch advies voor de moestuinier over succesvol kweken van deze plant."
            }`;
        } else if (mode === "garden_assistant") {
            prompt = `Je bent de KweekKompas Moestuin-Expert.
            Vraag: ${input}. 
            Maand: ${month}. 
            Context: ${contextNL} 

            Regels:
            - ANTWOORD ALTIJD IN HET NEDERLANDS.
            - Maximaal 3 korte, krachtige bullet points.
            - Gebruik gewone-mensentaal.
            - Adviseer specifiek voor Nederland/België (klimaat).
            - Geen intro of outro, begin direct met tekst.`;
        } else {
            prompt = `Geef 5 suggesties voor zaaien in ${month} in Nederland. Geef ALIEEN dit JSON formaat: { "planten": ["Naam"] }`;
        }

        // --- ROUTERING ---
        try {
            if (isLocal) {
                // LOKAAL: Gebruik Ollama
                const res = await fetch("http://localhost:11434/api/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "llama3",
                        prompt: prompt,
                        stream: false
                    })
                });
                if (!res.ok) throw new Error(`Ollama niet bereikbaar (Status: ${res.status})`);
                const data = await res.json();
                return data.response || "";
            } else {
                // ONLINE: Gebruik de Netlify Backend
                const res = await fetch("/api/gemini-ai", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode, input, month })
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || `Backend Fout (${res.status})`);
                }
                const data = await res.json();
                return data.text || "";
            }
        } catch (err) {
            console.error("AI Request Failed:", err);
            // No UI feedback here, let the caller handle it to prevent double toasts
            throw err;
        }
    }

    function buildAIPrompt(seedData) {
        const months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
        const currentMonth = months[new Date().getMonth()];

        return `
Je bent een praktische moestuin assistent voor een moestuin app.

Regels:
- Alleen planten met status "Voorraad"
- Gebruik de zaaitijd om te bepalen wat NU relevant is voor de maand ${currentMonth}
- Max 5 acties
- Kort en concreet
- Geen intro
- Geen uitleg onderaan
- Elke actie op een nieuwe regel

Gebruik labels:
- 🟢 Nu zaaien
- 🟡 Binnenkort
- 🔴 Gemist

Voorbeeld output:
🟢 Zaai tomaten binnen
🟡 Bereid courgette voor
🔴 Papaver te laat om te zaaien

Gebruik deze data:
${JSON.stringify(seedData.filter(s => s.status === 'Voorraad').map(s => ({ naam: s.naam, zaaitijd: s.zaaitijd })))}

Maand: ${currentMonth}
`;
    }

    // --- AI ASSISTANT PANEL ---
    async function stelAIHulpVraag(vraag) {
        const input = document.getElementById('ai-question-input');
        const btn = document.getElementById('btn-ask-ai');
        const output = document.getElementById('ai-assistant-output');
        if (!output) return;

        const months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
        const currentMonth = months[new Date().getMonth()];

        // Map quick questions if they match exactly
        const questionMap = {
            'Wat moet ik nu doen?': 'Wat moet ik deze week concreet doen in mijn moestuin?',
            'Waar ben ik te laat?': 'Waar ben ik nu te laat mee met zaaien?',
            'Wat kan ik nu zaaien?': 'Welke planten kan ik nu nog zaaien en waarom?'
        };
        const userInput = questionMap[vraag] || vraag || (input ? input.value.trim() : '');
        if (!userInput) return;

        if (input && !questionMap[vraag]) input.value = userInput;
        if (btn) {
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.innerText = "Even nadenken...";
        }

        output.innerHTML = '<div class="ai-loading-text">🪄 De assistent stelt een plan voor...</div>';
        output.style.display = 'block';
        output.dataset.active = "true"; // Voorkom dat renderHome het verbergt tijdens dit proces


        try {
            const res = await vraagAI('garden_assistant', userInput, currentMonth);
            output.innerHTML = '';

            // Basic cleanup of markdown-style artifacts if AI ignores rules
            const sanitized = res.replace(/[\*#_]/g, '');

            // Split response into lines and filter empty ones
            const lines = sanitized.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            const commonPlants = [
                'tomaat', 'prei', 'spinazie', 'paprika', 'courgette', 'komkommer', 'sla', 'wortel', 'ui', 'knoflook', 'aardappel',
                'boerenkool', 'radijs', 'pompoen', 'aubergine', 'peper', 'meloen', 'basilicum', 'lavendel', 'aardbei', 'framboos',
                'bes', 'zonnebloem', 'papaver', 'biet', 'snijboon', 'sperzieboon', 'erwt', 'peul', 'maïs', 'kapucijner', 'pastinaak',
                'schorseneer', 'andijvie', 'veldsla', 'rucola', 'peterselie', 'bieslook', 'rozemarijn', 'tijm', 'munt', 'salie',
                'dille', 'koriander', 'venkel', 'asperge', 'rabarber', 'artisjok', 'olijf', 'olijfboom', 'kers', 'appel', 'peer'
            ];

            const allDetectedPlants = [];

            lines.forEach((line, idx) => {
                const card = document.createElement('div');
                card.className = 'ai-advies-card';
                card.style.fontSize = '13px';
                card.innerText = line;

                const lowerLine = line.toLowerCase();
                
                // 1. Strict check against commonPlants list only
                commonPlants.forEach(plant => {
                    // Use a word boundary check to prevent matching partial words
                    const regex = new RegExp(`\\b${plant}\\w*\\b`, 'i'); 
                    if (regex.test(line) && !allDetectedPlants.includes(plant)) {
                        allDetectedPlants.push(plant);
                    }
                });

                output.appendChild(card);
            });

            // 8.1c: Suggesties Sectie (Echte AI output)
            if (allDetectedPlants.length > 0) {
                const suggestionContainer = document.createElement('div');
                suggestionContainer.style.marginTop = '16px';
                suggestionContainer.style.padding = '12px 16px';
                suggestionContainer.style.borderTop = '1px solid var(--border-color)';
                suggestionContainer.style.background = 'rgba(0,0,0,0.02)';
                suggestionContainer.style.borderRadius = '0 0 var(--radius-content) var(--radius-content)';

                // Max 5 suggesties, netjes gekapitaliseerd
                const uniqueSuggestions = [...new Set(allDetectedPlants)]
                    .map(p => p.charAt(0).toUpperCase() + p.slice(1));

                const renderSuggestions = (all, expanded) => {
                    const visible = expanded ? all : all.slice(0, 3);
                    const hasMore = all.length > 3;

                    suggestionContainer.innerHTML = `
                        <div style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; margin-top: 5px;">Suggesties vanuit het advies</div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${visible.map(plant => `
                                <div class="ai-suggestion-row">
                                    <span style="font-size: 14px; font-weight: 600;">${plant}</span>
                                    <div class="ai-actions-group">
                                        <button class="btn-ai-action ghost" onclick="window._addSuggestionToWishlist('${plant}', this)" title="Op wishlist zetten">
                                            <span class="icon">+</span> Wishlist
                                        </button>
                                        <button class="btn-ai-action secondary" onclick="window._addSuggestionToTodo('${plant}', this)" title="Toevoegen aan acties">
                                            <span class="icon">⚡</span> Nu doen
                                        </button>
                                        <button class="btn-ai-action primary" onclick="window._addSuggestionToSeeds('${plant}', this)" title="Direct zaaien">
                                            <span class="icon">🌱</span> Zaaien
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${hasMore ? `
                            <button class="btn-footer-toggle ai-toggle-more" style="width: 100%; margin-top: 10px; border-style: dashed;">
                                ${expanded ? '▴ Minder weergeven' : `▾ Meer weergeven (${all.length - 3} extra)`}
                            </button>
                        ` : ''}
                    `;

                    const toggleBtn = suggestionContainer.querySelector('.ai-toggle-more');
                    if (toggleBtn) {
                        toggleBtn.onclick = () => renderSuggestions(all, !expanded);
                    }
                };

                renderSuggestions(uniqueSuggestions, false);
                output.appendChild(suggestionContainer);
            }
        } catch (err) {
            console.error("Assistant Error:", err);
            output.innerHTML = `
                <div class="ai-error-state" style="padding: 16px; border-radius: 8px; background: rgba(229, 62, 62, 0.1); border: 1px solid rgba(229, 62, 62, 0.2); color: #FEB2B2; font-size: 13px;">
                    <span style="display:block; margin-bottom: 4px;">⚠️ <strong>Oeps, de assistent is even in de war.</strong></span>
                    <span style="font-size: 11px; opacity: 0.8;">Dit kan komen door de verbinding of een limiet bij Google. Probeer het over een minuutje nog eens!</span>
                    <div style="font-size: 10px; margin-top: 8px; font-family: monospace; opacity: 0.5;">Fout: ${err.message || 'Onbekend'}</div>
                </div>
            `;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.textContent = "✨ Vraag Advies";
            }
        }
    }

    const btnAskAi = document.getElementById('btn-ask-ai');
if (btnAskAi) btnAskAi.onclick = () => stelAIHulpVraag();

const aiInput = document.getElementById('ai-question-input');
if (aiInput) {
    aiInput.onkeypress = (e) => {
        if (e.key === 'Enter') stelAIHulpVraag();
    };
}

window._quickAskAI = (vraag) => stelAIHulpVraag(vraag);

function applyMonthFilter(monthName) {
    if (!monthName) return;

    // Map full month name to short name because seeds are stored with short names
    const mIdx = calMonthNames.indexOf(monthName);
    const shortName = mIdx !== -1 ? monthNamesShort[mIdx] : monthName;

    const filtered = seeds.filter(seed =>
        seed.zaaitijd && (seed.zaaitijd.includes(monthName) || seed.zaaitijd.includes(shortName))
    );

    renderSeeds(filtered);
    showMonthContextBanner(monthName, filtered.length);
}

function showMonthContextBanner(month, count) {
    const container = document.getElementById('seeds-context-banner');
    if (!container) return;

    container.innerHTML = `
            <div class="seeds-month-context">
                <div class="context-info">
                    <span class="context-icon">🌱</span>
                    <span class="context-text"><strong>${month}</strong> &nbsp;•&nbsp; ${count} planten</span>
                </div>
                <button class="context-reset-btn" onclick="clearMonthFilter()" title="Filter herstellen">
                    <span>✕</span>
                </button>

            </div>
        `;
    container.classList.remove('hidden');
}

window.revealInList = function (seedId) {
    // 1. Ensure any month filters are cleared so the item is definitely visible
    if (window.clearMonthFilter) window.clearMonthFilter();
    activeCategory = 'Alles'; 
    localStorage.removeItem('nu_doen_show_all'); // Small reset if needed
    
    // 2. Refresh the list filters
    applyFilters(); 
    switchView('list');

    // 3. Scroll and Highlight (with a small delay for UI switch)
    setTimeout(() => {
        const card = document.getElementById(`seed-card-${seedId}`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('highlight-target');
            setTimeout(() => {
                card.classList.remove('highlight-target');
            }, 1800);
        }
    }, 150);
};

window.scrollToGardenItem = function (seedId) {
    const card = document.getElementById(`garden-card-${seedId}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlight-target');
        setTimeout(() => {
            card.classList.remove('highlight-target');
        }, 1500);
    }
};

window.clearMonthFilter = function () {
    activeMonthFilter = null;
    localStorage.removeItem('activeMonthFilter');
    const container = document.getElementById('seeds-context-banner');
    if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
    applyFilters(); // Re-apply current general filters/search
};

window._addToWishlistFromDetail = (id) => {
    const seed = seeds.find(s => String(s.id) === String(id));
    if (seed) addToWishlistFromCard(seed);
};

// 8.1b: Add Suggestion to Wishlist (Full Integration)
window._addSuggestionToWishlist = (name, btn) => {
    const lowerName = name.toLowerCase().trim();
    if (!lowerName || (btn && btn.disabled)) return;

    // Check for duplicates
    const exists = wishlist.some(item => item.name.toLowerCase() === lowerName);
    
    if (exists) {
        showToast("Staat al in je lijst"); 
        return;
    }

    const newItem = {
        id: Date.now().toString(),
        name: name.charAt(0).toUpperCase() + name.slice(1),
        link: '',
        image: '',
        note: 'Gevonden via Tuinassistent',
        type: 'seed',
        bought: false
    };

    wishlist.unshift(newItem);
    saveWish();
    
    showToast("Toegevoegd aan wishlist ✨");
    
    if (btn) {
        window._tempSuggestionFeedback(btn);
    }
};

// Internal helper for temporary button feedback
window._tempSuggestionFeedback = (btn) => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '✔';
    btn.disabled = true;
    btn.style.borderColor = 'var(--primary-color)';
    btn.style.color = 'var(--primary-color)';
    
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.style.borderColor = '';
        btn.style.color = '';
    }, 800);
};

// 8.1c: Add Suggestion to Seeds (Direct Sow)
window._addSuggestionToSeeds = async (name, btn) => {
    const lowerName = name.toLowerCase().trim();
    if (!lowerName || (btn && btn.disabled)) return;

    // Check for duplicates in actual seeds
    const existingSeeds = await getAllSeeds();
    const exists = existingSeeds.some(s => s.naam.toLowerCase() === lowerName);
    
    if (exists) {
        showToast("Staat al in je tuin");
        return;
    }

    // Prepare new seed object (Match starter structure for ID)
    const newSeed = {
        id: Number(Date.now()),
        naam: name.charAt(0).toUpperCase() + name.slice(1),
        type: 'Overig', 
        standplaats: 'Zon',
        water: 'Gemiddeld',
        status: 'Gezaaid', 
        zaaitijd: '',
        oogsttijd: '',
        tags: ['Gevonden via AI'],
        beschrijving: 'Direct toegevoegd vanuit assistent advies.',
        images: [],
        featuredImageUrl: '',
        isFavorite: false,
        lastSownYear: new Date().getFullYear()
    };

    // Enrichment
    for (let key in mockData) {
        if (lowerName.includes(key)) {
            newSeed.type = mockData[key].type;
            newSeed.standplaats = mockData[key].standplaats;
            newSeed.water = mockData[key].water;
            newSeed.zaaitijd = mockData[key].zaaitijd;
            newSeed.oogsttijd = mockData[key].oogsttijd;
            if (mockData[key].tags) newSeed.tags = [...newSeed.tags, ...mockData[key].tags];
            break;
        }
    }

    try {
        await saveSeed(newSeed);
        // FORCE update of local seeds array used for rendering
        const updatedSeeds = await getAllSeeds();
        if (typeof seeds !== 'undefined') {
            seeds.length = 0;
            seeds.push(...updatedSeeds);
        }
        
        showToast("Toegevoegd aan je tuin 🌱");
        if (btn) window._tempSuggestionFeedback(btn);
        
        // Refresh UI
        renderHome();
        if (!viewList.classList.contains('hidden')) applyFilters();
    } catch (err) {
        showToast("Fout bij opslaan");
        console.error(err);
    }
};

// 8.2: Add Suggestion to 'Nu doen' (Quick Action)
window._addSuggestionToTodo = async (name, btn) => {
    const lowerName = name.toLowerCase().trim();
    if (!lowerName || (btn && btn.disabled)) return;

    // Check for duplicates in actual seeds
    const existingSeeds = await getAllSeeds();
    const exists = existingSeeds.some(s => s.naam.toLowerCase() === lowerName);
    
    if (exists) {
        showToast("Staat al in je lijst");
        return;
    }

    const monthsNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    const currentMonth = monthsNames[new Date().getMonth()];
    const currentMonthCap = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);

    const newSeed = {
        id: Number(Date.now()),
        naam: name.charAt(0).toUpperCase() + name.slice(1),
        type: 'Overig', 
        standplaats: 'Zon',
        water: 'Gemiddeld',
        status: 'Voorraad', 
        zaaitijd: currentMonthCap, // Default to now
        oogsttijd: '',
        tags: ['Gevonden via AI', 'Nu doen'],
        beschrijving: 'Toegevoegd via snelle AI actie.',
        images: [],
        featuredImageUrl: '',
        isFavorite: false
    };

    // Enrichment
    for (let key in mockData) {
        if (lowerName.includes(key)) {
            newSeed.type = mockData[key].type;
            newSeed.standplaats = mockData[key].standplaats;
            newSeed.water = mockData[key].water;
            newSeed.zaaitijd = mockData[key].zaaitijd;
            newSeed.oogsttijd = mockData[key].oogsttijd;
            if (mockData[key].tags) newSeed.tags = [...newSeed.tags, ...mockData[key].tags];
            break;
        }
    }

    // Force current month to ensure it shows up in "Nu zaaien"
    if (!newSeed.zaaitijd.toLowerCase().includes(currentMonth)) {
        newSeed.zaaitijd = newSeed.zaaitijd ? `${newSeed.zaaitijd}, ${currentMonthCap}` : currentMonthCap;
    }

    try {
        await saveSeed(newSeed);
        const updatedSeeds = await getAllSeeds();
        if (typeof seeds !== 'undefined') {
            seeds.length = 0;
            seeds.push(...updatedSeeds);
        }
        
        showToast("Toegevoegd aan je acties ⚡");
        if (btn) window._tempSuggestionFeedback(btn);
        
        renderHome();
    } catch (err) {
        showToast("Fout bij opslaan");
        console.error(err);
    }
};

window.applyMonthFilter = applyMonthFilter;

    // --- STARTUP LOGIC ---
    const doneOnb = localStorage.getItem('onboarding_done');
    if (!doneOnb && seeds.length === 0) {
        switchView('onboarding');
    } else {
        switchView('home');
    }
});



// --- IMAGE SEARCH INTEGRATION (Unsplash) ---
async function searchPlantImage(query) {
    const ACCESS_KEY = 'SKRS2cE9UySRiAEXZ6wW2__-Tsl-BelT7Y7ryi1IwUs';

    // Simple NL -> EN mapping for common garden plants to boost Unsplash results
    const translations = {
        'tomaat': 'tomato', 'paprika': 'bell pepper', 'peper': 'chili pepper', 'pepers': 'hot peppers',
        'komkommer': 'cucumber', 'courgette': 'zucchini', 'sla': 'lettuce', 'rucola': 'arugula',
        'wortel': 'carrot', 'prei': 'leek', 'ui': 'onion', 'knoflook': 'garlic', 'spinazie': 'spinach',
        'aardappel': 'potato', 'aardbei': 'strawberry', 'framboos': 'raspberry', 'bes': 'berry',
        'erwt': 'pea', 'peul': 'snow pea', 'boon': 'bean', 'pompoen': 'pumpkin', 'biet': 'beetroot', 'radijs': 'radish',
        'tijm': 'thyme', 'basilicum': 'basil', 'peterselie': 'parsley', 'bieslook': 'chive', 'rozemarijn': 'rosemary',
        'munt': 'mint', 'salie': 'sage', 'dille': 'dill', 'koriander': 'cilantro', 'oregano': 'oregano',
        'appel': 'apple', 'peer': 'pear', 'kers': 'cherry', 'pruim': 'plum', 'perzik': 'peach',
        'broccoli': 'broccoli', 'bloemkool': 'cauliflower', 'boerenkool': 'kale', 'paksoi': 'bok choy', 'pastinaak': 'parsnip',
        'zonnebloem': 'sunflower', 'tulp': 'tulip', 'roos': 'rose', 'lavendel': 'lavender', 'papaver': 'poppy', 'goudsbloem': 'calendula',
        'madeliefje': 'daisy', 'moestuin': 'vegetable garden', 'tuin': 'garden'
    };

    const qLower = query.toLowerCase().split('(')[0].trim().split(' ')[0]; // Get base word
    const enTerm = translations[qLower] || query;
    const searchQuery = `${enTerm} plant garden`;

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&client_id=${ACCESS_KEY}&per_page=12`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Unsplash API fout");

        const data = await response.json();

        if (data && data.results) {
            return data.results.map(r => ({
                url: r.urls?.regular || r.urls?.small,
                source: 'web',
                id: r.id
            }));
        }
        return [];
    } catch (error) {
        console.error("Fout bij ophalen afbeeldingen van Unsplash:", error);
        return [];
    }
}


// --- SETTINGS PANEL HELPERS ---

window.toggleThemeFromPanel = function(checkbox) {
    const isDark = checkbox.checked;
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    }
    // Update the labels in the panel manually via re-render
    renderSettingsPanel();
};

