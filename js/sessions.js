// Sessiebeheer logica
let currentTeacherId = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await anonymousLogin();
    currentTeacherId = auth.currentUser.uid;
    
    // Event listeners
    document.getElementById('createSessionBtn').onclick = createNewSession;
    document.getElementById('logoutBtn').onclick = () => auth.signOut().then(() => location.href = 'index.html');
    
    // Laad sessies
    loadActiveSessions();
    loadEndedSessions();
    
  } catch (error) {
    console.error("Initialisatie fout:", error);
    alert("Fout bij laden: " + error.message);
  }
});

async function createNewSession() {
  const gridSize = parseInt(document.getElementById('newGridSize').value);
  const code = generateSessionCode();
  
  const sessionData = {
    code: code,
    gridSize: gridSize,
    active: true,
    teacherId: currentTeacherId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    currentSpin: null,
    currentQuestion: null,
    currentIcon: null,
    currentAnswerRevealed: false,
    correctAnswer: null
  };
  
  try {
    const docRef = await bingoSessions.add(sessionData);
    console.log("Sessie aangemaakt:", docRef.id, "Code:", code);
    
    // Toon succesmelding
    alert(`✅ Sessie aangemaakt!\nCode: ${code}\nKlik OK om naar de leraarpagina te gaan.`);
    
    // Ga naar de leraarpagina met de sessie ID
    window.location.href = `teacher.html?sessionId=${docRef.id}`;
    
  } catch (error) {
    console.error("Fout bij aanmaken sessie:", error);
    alert("Fout: " + error.message);
  }
}

async function loadActiveSessions() {
  try {
    const snapshot = await bingoSessions
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .get();
    
    const container = document.getElementById('activeSessionsList');
    
    if (snapshot.empty) {
      container.innerHTML = '<div class="empty-state">🎯 Geen actieve sessies</div>';
      return;
    }
    
    container.innerHTML = '';
    snapshot.forEach(doc => {
      const session = doc.data();
      const sessionId = doc.id;
      const date = session.createdAt?.toDate().toLocaleString() || 'Onbekend';
      const playerCount = session.playerCount || 0;
      
      const sessionCard = document.createElement('div');
      sessionCard.className = 'session-card';
      sessionCard.innerHTML = `
        <div class="session-info">
          <div class="session-code">🔑 Code: <strong>${session.code}</strong></div>
          <div class="session-details">
            <span><i class="fas fa-calendar"></i> ${date}</span>
            <span><i class="fas fa-users"></i> ${playerCount} spelers</span>
            <span><i class="fas fa-table"></i> ${session.gridSize} vakjes</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="btn-primary resume-session" data-id="${sessionId}">
            <i class="fas fa-play"></i> Hervatten
          </button>
          <button class="btn-secondary end-session" data-id="${sessionId}">
            <i class="fas fa-stop"></i> Beëindigen
          </button>
        </div>
      `;
      container.appendChild(sessionCard);
    });
    
    // Event listeners voor knoppen
    document.querySelectorAll('.resume-session').forEach(btn => {
      btn.onclick = () => resumeSession(btn.dataset.id);
    });
    document.querySelectorAll('.end-session').forEach(btn => {
      btn.onclick = () => endSession(btn.dataset.id);
    });
    
  } catch (error) {
    console.error("Fout bij laden actieve sessies:", error);
    document.getElementById('activeSessionsList').innerHTML = '<div class="error">Fout bij laden sessies</div>';
  }
}

async function loadEndedSessions() {
  try {
    const snapshot = await bingoSessions
      .where('active', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    
    const container = document.getElementById('endedSessionsList');
    
    if (snapshot.empty) {
      container.innerHTML = '<div class="empty-state">📭 Geen beëindigde sessies</div>';
      return;
    }
    
    container.innerHTML = '';
    snapshot.forEach(doc => {
      const session = doc.data();
      const sessionId = doc.id;
      const date = session.createdAt?.toDate().toLocaleString() || 'Onbekend';
      const endDate = session.endedAt?.toDate().toLocaleString() || 'Onbekend';
      const playerCount = session.playerCount || 0;
      
      const sessionCard = document.createElement('div');
      sessionCard.className = 'session-card ended';
      sessionCard.innerHTML = `
        <div class="session-info">
          <div class="session-code">🔑 Code: <strong>${session.code}</strong></div>
          <div class="session-details">
            <span><i class="fas fa-calendar"></i> Gestart: ${date}</span>
            <span><i class="fas fa-calendar-check"></i> Beëindigd: ${endDate}</span>
            <span><i class="fas fa-users"></i> ${playerCount} spelers</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="btn-secondary view-session" data-id="${sessionId}">
            <i class="fas fa-eye"></i> Bekijk
          </button>
          <button class="btn-danger delete-session" data-id="${sessionId}">
            <i class="fas fa-trash"></i> Verwijder
          </button>
        </div>
      `;
      container.appendChild(sessionCard);
    });
    
    // Event listeners voor archief knoppen
    document.querySelectorAll('.view-session').forEach(btn => {
      btn.onclick = () => viewSession(btn.dataset.id);
    });
    document.querySelectorAll('.delete-session').forEach(btn => {
      btn.onclick = () => deleteSession(btn.dataset.id);
    });
    
  } catch (error) {
    console.error("Fout bij laden archief sessies:", error);
    document.getElementById('endedSessionsList').innerHTML = '<div class="error">Fout bij laden archief</div>';
  }
}

async function resumeSession(sessionId) {
  // Ga naar teacher.html met de sessie ID
  window.location.href = `teacher.html?sessionId=${sessionId}`;
}

async function endSession(sessionId) {
  if (!confirm("Weet je zeker dat je deze sessie wilt beëindigen? Leerlingen kunnen niet meer deelnemen.")) {
    return;
  }
  
  try {
    await bingoSessions.doc(sessionId).update({
      active: false,
      endedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("Sessie beëindigd");
    loadActiveSessions();
    loadEndedSessions();
  } catch (error) {
    console.error("Fout bij beëindigen sessie:", error);
    alert("Fout: " + error.message);
  }
}

async function viewSession(sessionId) {
  // Ga naar een rapportage pagina (optioneel, kan later toegevoegd worden)
  window.location.href = `teacher.html?sessionId=${sessionId}&readonly=true`;
}

async function deleteSession(sessionId) {
  if (!confirm("Weet je zeker dat je deze sessie PERMANENT wilt verwijderen? Alle spelers en claims worden ook verwijderd!")) {
    return;
  }
  
  try {
    // Verwijder alle spelers van deze sessie
    const playersSnapshot = await bingoPlayers.where('sessionId', '==', sessionId).get();
    const batch = db.batch();
    playersSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Verwijder alle claims van deze sessie
    const claimsSnapshot = await bingoClaims.where('sessionId', '==', sessionId).get();
    claimsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Verwijder de sessie zelf
    batch.delete(bingoSessions.doc(sessionId));
    
    await batch.commit();
    alert("Sessie en alle bijbehorende data verwijderd");
    loadActiveSessions();
    loadEndedSessions();
    
  } catch (error) {
    console.error("Fout bij verwijderen sessie:", error);
    alert("Fout: " + error.message);
  }
}
