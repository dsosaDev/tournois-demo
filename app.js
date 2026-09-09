(function () {
  'use strict';
  const state = { data: null, tournamentId: '', divisionId: 'all', teamId: 'all', matchStatus: 'all', photoLimit: 12 };
  const playoffPhaseOrder = ['ÉLIMINATOIRE', 'QUART-DE-FINALE', 'DEMI-FINALE', 'FINALE'];
  const elements = {};
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements(); bindEvents();
    try {
      state.data = await loadData();
      if (!state.data.tournoi.length) throw new Error('Aucun tournoi public n’a été trouvé.');
      state.tournamentId = state.data.tournoi[0].id;
      populateFilters(); render();
    } catch (error) {
      showStatus('Impossible de charger les données du tournoi. ' + error.message, true);
      elements.publicationDate.textContent = 'Données indisponibles';
    }
  }

  function cacheElements() {
    ['tournament-name','tournament-details','publication-date','registration-link','status','tournament-filter','division-filter','team-filter',
      'match-status-filter','summary-cards','upcoming-matches','matches','champions-content','playoffs-content','standings-content','teams-content',
      'photos-content','photos-load-more','photo-dialog','photo-dialog-close','photo-dialog-image','photo-dialog-title','photo-dialog-details'].forEach(function (id) {
      elements[toCamel(id)] = document.getElementById(id);
    });
  }

  function configureRegistrationLink(tournament) {
    const url = safeExternalUrl(tournament && tournament.registrationUrl);
    const deadlineOpen = !tournament.registrationDeadline || new Date() <= new Date(tournament.registrationDeadline + 'T23:59:59');
    const isOpen = Boolean(tournament.registrationsOpen && deadlineOpen && url);
    elements.registrationLink.hidden = !isOpen;
    if (isOpen) elements.registrationLink.href = url;
    else elements.registrationLink.removeAttribute('href');
  }

  function bindEvents() {
    elements.tournamentFilter.addEventListener('change', function (event) {
      state.tournamentId = event.target.value; state.divisionId = 'all'; state.teamId = 'all'; resetPhotoLimit(); populateFilters(); render();
    });
    elements.divisionFilter.addEventListener('change', function (event) {
      state.divisionId = event.target.value; state.teamId = 'all'; resetPhotoLimit(); populateTeamFilter(); render();
    });
    elements.teamFilter.addEventListener('change', function (event) { state.teamId = event.target.value; resetPhotoLimit(); render(); });
    elements.matchStatusFilter.addEventListener('change', function (event) { state.matchStatus = event.target.value; renderMatches(); });
    elements.photosLoadMore.addEventListener('click', function () { state.photoLimit += 12; renderPhotos(); });
    elements.photoDialogClose.addEventListener('click', closePhotoDialog);
    elements.photoDialog.addEventListener('close', clearPhotoDialog);
    elements.photoDialog.addEventListener('click', function (event) {
      if (event.target === elements.photoDialog) closePhotoDialog();
    });
    document.querySelectorAll('.tab').forEach(function (button) {
      button.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (tab) { tab.classList.remove('is-active'); });
        document.querySelectorAll('.panel').forEach(function (panel) { panel.classList.remove('is-active'); });
        button.classList.add('is-active'); document.getElementById(button.dataset.tab).classList.add('is-active');
      });
    });
  }

  async function loadData() {
    const config = window.TOURNAMENT_CONFIG || {};
    const baseUrl = config.PUBLIC_DATA_URL || config.FALLBACK_DATA_URL || './data/exemple.csv';
    const response = await fetch(baseUrl + (baseUrl.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Réponse HTTP ' + response.status + '.');
    const grouped = { meta: [], tournoi: [], division: [], lieu: [], equipe: [], match: [], classement: [], photo: [] };
    parseCsv(await response.text()).slice(1).forEach(function (row) {
      if (!grouped[row[0]] || !row[3]) return;
      try { grouped[row[0]].push(JSON.parse(row[3])); } catch (error) { /* Ligne publique invalide ignorée. */ }
    });
    grouped.publication = grouped.meta[0] || {};
    return grouped;
  }

  function parseCsv(text) {
    const rows = []; let row = []; let field = ''; let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
        else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') quoted = true;
      else if (character === ',') { row.push(field); field = ''; }
      else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += character;
    }
    if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    return rows;
  }

  function populateFilters() {
    fillSelect(elements.tournamentFilter, state.data.tournoi, state.tournamentId, false, 'Tous les tournois');
    fillSelect(elements.divisionFilter, state.data.division.filter(function (item) { return item.tournamentId === state.tournamentId; }), state.divisionId, true, 'Toutes les divisions');
    populateTeamFilter();
  }

  function populateTeamFilter() {
    const teams = state.data.equipe.filter(function (item) {
      return item.tournamentId === state.tournamentId && (state.divisionId === 'all' || item.divisionId === state.divisionId);
    });
    fillSelect(elements.teamFilter, teams, state.teamId, true, 'Toutes les équipes');
  }

  function fillSelect(select, items, selected, includeAll, allLabel) {
    const options = includeAll ? [{ id: 'all', name: allLabel }] : [];
    options.push.apply(options, items);
    select.innerHTML = options.map(function (item) {
      return '<option value="' + escapeHtml(item.id) + '"' + (item.id === selected ? ' selected' : '') + '>' + escapeHtml(item.name) + '</option>';
    }).join('');
  }

  function render() {
    const tournament = state.data.tournoi.find(function (item) { return item.id === state.tournamentId; });
    if (!tournament) return;
    elements.tournamentName.textContent = tournament.name;
    elements.tournamentDetails.textContent = [tournament.edition, formatDateRange(tournament.startDate, tournament.endDate), tournament.mainVenue].filter(Boolean).join(' · ');
    configureRegistrationLink(tournament);
    elements.publicationDate.textContent = state.data.publication.publishedAt ? 'Dernière publication : ' + formatDateTime(state.data.publication.publishedAt) : 'Date de publication inconnue';
    if (state.data.publication.message) showStatus(state.data.publication.message, false); else elements.status.hidden = true;
    renderSummary(); renderMatches(); renderPlayoffs(); renderStandings(); renderTeams(); renderPhotos();
  }

  function filteredTeams() {
    return state.data.equipe.filter(function (team) {
      return team.tournamentId === state.tournamentId && (state.divisionId === 'all' || team.divisionId === state.divisionId) && (state.teamId === 'all' || team.id === state.teamId);
    });
  }

  function filteredMatches(ignoreStatus) {
    return state.data.match.filter(function (match) {
      const teamMatch = state.teamId === 'all' || match.homeTeamId === state.teamId || match.awayTeamId === state.teamId;
      const statusMatch = ignoreStatus || state.matchStatus === 'all' || (state.matchStatus === 'final' ? match.final : !match.final);
      return match.tournamentId === state.tournamentId && (state.divisionId === 'all' || match.divisionId === state.divisionId) && teamMatch && statusMatch;
    }).sort(compareMatches);
  }

  function renderSummary() {
    const teams = filteredTeams(); const matches = filteredMatches(true);
    const finalMatches = matches.filter(function (match) { return match.final; });
    const goals = finalMatches.reduce(function (total, match) { return total + (match.homeScore || 0) + (match.awayScore || 0); }, 0);
    elements.summaryCards.innerHTML = [summaryCard(teams.length,'Équipes'),summaryCard(finalMatches.length,'Matchs terminés'),
      summaryCard(matches.length - finalMatches.length,'Matchs à venir'),summaryCard(goals,'Buts marqués')].join('');
    renderMatchList(elements.upcomingMatches, matches.filter(function (match) { return !match.final; }).slice(0,6), 'Aucun match à venir dans cette sélection.');
  }

  function summaryCard(value, label) { return '<article class="summary-card"><strong>' + value + '</strong><span>' + escapeHtml(label) + '</span></article>'; }
  function renderMatches() { renderMatchList(elements.matches, filteredMatches(false), 'Aucun match dans cette sélection.'); }

  function renderMatchList(container, matches, emptyMessage) {
    if (!matches.length) { container.innerHTML = empty(emptyMessage); return; }
    container.innerHTML = matchCardsHtml(matches);
  }

  function matchCardsHtml(matches) {
    const teamIndex = Object.fromEntries(state.data.equipe.map(function (team) { return [team.id,team]; }));
    const venueIndex = Object.fromEntries(state.data.lieu.map(function (venue) { return [venue.id,venue]; }));
    const divisionIndex = Object.fromEntries(state.data.division.map(function (division) { return [division.id,division]; }));
    return matches.map(function (match) {
      const home = teamIndex[match.homeTeamId] || { name: match.homeTeamId };
      const away = teamIndex[match.awayTeamId] || { name: match.awayTeamId };
      const division = divisionIndex[match.divisionId] || { name: '' };
      const venue = venueIndex[match.venueId] || { name: '' };
      const status = match.final ? '<span class="badge">Final</span>' : escapeHtml(match.time || 'Heure à confirmer');
      return '<article class="match-card"><div class="match-card__meta"><span>' + escapeHtml(formatDate(match.date)) + '</span><span>' + status + '</span></div>' +
        '<div class="match-card__body">' + matchTeam(home.name,match.final ? match.homeScore : '–') + matchTeam(away.name,match.final ? match.awayScore : '–') + '</div>' +
        '<div class="match-card__footer">' + escapeHtml([division.name,match.pool ? 'Pool ' + match.pool : '',venue.name].filter(Boolean).join(' · ')) + '</div></article>';
    }).join('');
  }

  function matchTeam(name, score) { return '<div class="match-team"><span>' + escapeHtml(name) + '</span><strong class="score">' + escapeHtml(score) + '</strong></div>'; }

  function renderPlayoffs() {
    const divisionIndex = Object.fromEntries(state.data.division.map(function (division) { return [division.id, division]; }));
    const teamIndex = Object.fromEntries(state.data.equipe.map(function (team) { return [team.id, team]; }));
    const playoffMatches = filteredMatches(true).filter(isPlayoffMatch);
    const divisionIds = unique(playoffMatches.map(function (match) { return match.divisionId; }));
    const blocks = divisionIds.map(function (divisionId) {
      const division = divisionIndex[divisionId] || { name: divisionId };
      const matches = playoffMatches.filter(function (match) { return match.divisionId === divisionId; });
      const phases = playoffPhaseOrder.map(function (phase) {
        const phaseMatches = matches.filter(function (match) { return normalizePhase(match.phase) === normalizePhase(phase); });
        if (!phaseMatches.length) return '';
        return '<section class="playoff-round"><h4>' + escapeHtml(playoffPhaseLabel(phase)) + '</h4><div class="match-grid">' +
          matchCardsHtml(phaseMatches) + '</div></section>';
      }).join('');
      return '<article class="playoff-block"><h3>' + escapeHtml(division.name) + '</h3>' + phases + '</article>';
    });
    elements.playoffsContent.innerHTML = blocks.join('') || empty('Aucun match éliminatoire n’est encore publié dans cette sélection.');

    const visibleDivisions = state.data.division.filter(function (division) {
      return division.tournamentId === state.tournamentId && (state.divisionId === 'all' || division.id === state.divisionId);
    });
    const champions = [];
    visibleDivisions.forEach(function (division) {
      const finals = state.data.match.filter(function (match) {
        return match.tournamentId === state.tournamentId && match.divisionId === division.id &&
          normalizePhase(match.phase) === 'FINALE' && match.final;
      }).sort(compareMatches);
      if (!finals.length) return;
      const finalMatch = finals[finals.length - 1];
      const winnerId = championTeamId(finalMatch);
      if (!winnerId || (state.teamId !== 'all' && state.teamId !== winnerId)) return;
      const winner = teamIndex[winnerId] || { name: winnerId };
      champions.push('<article class="champion-card"><span>Champion · ' + escapeHtml(division.name) + '</span><strong>' +
        escapeHtml(winner.name) + '</strong><small>Finale du ' + escapeHtml(formatDate(finalMatch.date)) + '</small></article>');
    });
    elements.championsContent.innerHTML = champions.join('') || empty('Les champions apparaîtront ici lorsque les finales seront terminées.');
  }

  function normalizePhase(value) {
    return String(value == null ? '' : value).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function isPlayoffMatch(match) { return playoffPhaseOrder.map(normalizePhase).includes(normalizePhase(match && match.phase)); }

  function playoffPhaseLabel(phase) {
    return {
      'ELIMINATOIRE': 'Éliminatoires',
      'QUART-DE-FINALE': 'Quarts de finale',
      'DEMI-FINALE': 'Demi-finales',
      'FINALE': 'Finale'
    }[normalizePhase(phase)] || String(phase || 'Séries');
  }

  function championTeamId(match) {
    if (!match || !match.final) return '';
    if (match.homeScore === '' || match.homeScore == null || match.awayScore === '' || match.awayScore == null) return '';
    const home = Number(match.homeScore);
    const away = Number(match.awayScore);
    if (!Number.isFinite(home) || !Number.isFinite(away) || home === away) return '';
    return home > away ? String(match.homeTeamId || '') : String(match.awayTeamId || '');
  }

  function renderStandings() {
    const divisions = state.data.division.filter(function (division) { return division.tournamentId === state.tournamentId && (state.divisionId === 'all' || division.id === state.divisionId); });
    const blocks = [];
    divisions.forEach(function (division) {
      const rows = state.data.classement.filter(function (row) { return row.divisionId === division.id && (state.teamId === 'all' || row.teamId === state.teamId); });
      unique(rows.map(function (row) { return row.pool || ''; })).forEach(function (pool) {
        const poolRows = rows.filter(function (row) { return (row.pool || '') === pool; });
        if (!poolRows.length) return;
        blocks.push('<article class="standing-block"><h3>' + escapeHtml(division.name + (pool ? ' — Pool ' + pool : '')) + '</h3><div class="table-scroll"><table><thead><tr>' +
          '<th>Rang</th><th>Équipe</th><th>PJ</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>Diff</th><th>Pts</th></tr></thead><tbody>' +
          poolRows.map(standingRow).join('') + '</tbody></table></div></article>');
      });
    });
    elements.standingsContent.innerHTML = blocks.join('') || empty('Aucun classement dans cette sélection.');
  }

  function standingRow(row) {
    return '<tr><td>' + row.rank + '</td><td>' + escapeHtml(row.teamName) + '</td><td>' + row.played + '</td><td>' + row.wins + '</td><td>' + row.draws + '</td><td>' + row.losses + '</td><td>' + row.goalsFor + '</td><td>' + row.goalsAgainst + '</td><td>' + signed(row.difference) + '</td><td><strong>' + row.points + '</strong></td></tr>';
  }

  function renderTeams() {
    const divisionIndex = Object.fromEntries(state.data.division.map(function (division) { return [division.id,division]; }));
    elements.teamsContent.innerHTML = filteredTeams().map(function (team) {
      const division = divisionIndex[team.divisionId] || { name: '' };
      return '<article class="team-card"><h3>' + escapeHtml(team.name) + '</h3><p>' + escapeHtml([team.school,division.name,team.pool ? 'Pool ' + team.pool : ''].filter(Boolean).join(' · ')) + '</p></article>';
    }).join('') || empty('Aucune équipe dans cette sélection.');
  }

  function resetPhotoLimit() { state.photoLimit = 12; }

  function filteredPhotos() {
    return state.data.photo.filter(function (photo) {
      if (photo.tournamentId !== state.tournamentId) return false;
      if (state.divisionId !== 'all' && photo.divisionId && photo.divisionId !== state.divisionId) return false;
      if (state.teamId !== 'all' && photo.teamId && photo.teamId !== state.teamId) return false;
      return true;
    }).sort(comparePhotos);
  }

  function renderPhotos() {
    const divisionIndex = Object.fromEntries(state.data.division.map(function (division) { return [division.id, division]; }));
    const teamIndex = Object.fromEntries(state.data.equipe.map(function (team) { return [team.id, team]; }));
    const photos = filteredPhotos();
    const visiblePhotos = photos.slice(0, state.photoLimit);
    const cards = visiblePhotos.map(function (photo, index) {
      const urls = photoUrls(photo.url);
      if (!urls.imageUrl) return '';
      const title = String(photo.title || 'Photo du tournoi');
      const details = [photo.date ? formatDate(photo.date) : '',
        photo.divisionId && divisionIndex[photo.divisionId] ? divisionIndex[photo.divisionId].name : '',
        photo.teamId && teamIndex[photo.teamId] ? teamIndex[photo.teamId].name : ''].filter(Boolean).join(' · ');
      return '<article class="photo-card"><button class="photo-card__button" type="button" data-photo-index="' + index + '" aria-label="Agrandir : ' +
        escapeHtml(title) + '"><img src="' + escapeHtml(urls.imageUrl) + '" alt="' + escapeHtml(title) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>' +
        '<div class="photo-card__caption"><strong>' + escapeHtml(title) + '</strong>' + (details ? '<span>' + escapeHtml(details) + '</span>' : '') + '</div></article>';
    }).filter(Boolean);
    elements.photosContent.innerHTML = cards.join('') || empty('Aucune photo n’est encore publiée dans cette sélection.');
    const remaining = Math.max(photos.length - state.photoLimit, 0);
    elements.photosLoadMore.hidden = remaining === 0;
    elements.photosLoadMore.textContent = 'Voir plus de photos (' + Math.min(12, remaining) + ')';
    elements.photosContent.querySelectorAll('[data-photo-index]').forEach(function (button) {
      button.addEventListener('click', function () { openPhotoDialog(visiblePhotos[Number(button.dataset.photoIndex)], divisionIndex, teamIndex); });
      const photoImage = button.querySelector('img');
      photoImage.addEventListener('error', function () {
        button.disabled = true;
        button.innerHTML = '<span class="photo-card__unavailable">Photo indisponible</span>';
      });
    });
  }

  function openPhotoDialog(photo, divisionIndex, teamIndex) {
    if (!photo) return;
    const urls = photoUrls(photo.url);
    if (!urls.imageUrl) return;
    const title = String(photo.title || 'Photo du tournoi');
    const details = [photo.date ? formatDate(photo.date) : '',
      photo.divisionId && divisionIndex[photo.divisionId] ? divisionIndex[photo.divisionId].name : '',
      photo.teamId && teamIndex[photo.teamId] ? teamIndex[photo.teamId].name : ''].filter(Boolean).join(' · ');
    elements.photoDialogImage.src = urls.imageUrl;
    elements.photoDialogImage.alt = title;
    elements.photoDialogTitle.textContent = title;
    elements.photoDialogDetails.textContent = details;
    if (typeof elements.photoDialog.showModal === 'function') elements.photoDialog.showModal();
  }

  function closePhotoDialog() {
    if (elements.photoDialog.open) elements.photoDialog.close();
    else clearPhotoDialog();
  }

  function clearPhotoDialog() {
    elements.photoDialogImage.removeAttribute('src');
  }

  function photoUrls(value) {
    const safeUrl = safeExternalUrl(value);
    if (!safeUrl) return { imageUrl: '', sourceUrl: '' };
    const driveId = googleDriveFileId(safeUrl);
    try {
      const host = new URL(safeUrl).hostname;
      if ((host === 'drive.google.com' || host === 'docs.google.com') && !driveId) return { imageUrl: '', sourceUrl: '' };
    } catch (error) { return { imageUrl: '', sourceUrl: '' }; }
    if (!driveId) return { imageUrl: safeUrl, sourceUrl: safeUrl };
    return {
      imageUrl: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveId) + '&sz=w1600',
      sourceUrl: 'https://drive.google.com/file/d/' + encodeURIComponent(driveId) + '/view'
    };
  }

  function googleDriveFileId(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.hostname !== 'drive.google.com' && url.hostname !== 'docs.google.com') return '';
      const pathMatch = url.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/);
      const candidate = pathMatch ? pathMatch[1] : url.searchParams.get('id');
      return /^[A-Za-z0-9_-]{10,}$/.test(String(candidate || '')) ? String(candidate) : '';
    } catch (error) { return ''; }
  }

  function comparePhotos(a, b) {
    return String(b.date || '').localeCompare(String(a.date || '')) || String(a.id || '').localeCompare(String(b.id || ''));
  }

  function compareMatches(a,b) { return (a.date + a.time + a.id).localeCompare(b.date + b.time + b.id); }
  function unique(values) { return values.filter(function (value,index) { return values.indexOf(value) === index; }); }
  function signed(value) { return value > 0 ? '+' + value : String(value); }
  function empty(message) { return '<p class="empty">' + escapeHtml(message) + '</p>'; }
  function toCamel(value) { return value.replace(/-([a-z])/g, function (_,letter) { return letter.toUpperCase(); }); }
  function formatDate(value) { if (!value) return 'Date à confirmer'; return new Intl.DateTimeFormat('fr-CA',{ weekday:'short',day:'numeric',month:'short' }).format(new Date(value + 'T12:00:00')); }
  function formatDateRange(start,end) { if (!start) return ''; return !end || end === start ? formatDate(start) : formatDate(start) + ' au ' + formatDate(end); }
  function formatDateTime(value) { return new Intl.DateTimeFormat('fr-CA',{ dateStyle:'long',timeStyle:'short' }).format(new Date(value)); }
  function showStatus(message,isError) { elements.status.textContent = message; elements.status.hidden = false; elements.status.classList.toggle('is-error',Boolean(isError)); }
  function safeExternalUrl(value) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; } catch (error) { return ''; } }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g,function (character) { return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]; }); }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizePhase: normalizePhase, isPlayoffMatch: isPlayoffMatch, playoffPhaseLabel: playoffPhaseLabel,
      championTeamId: championTeamId, photoUrls: photoUrls, googleDriveFileId: googleDriveFileId, comparePhotos: comparePhotos };
  }
})();
