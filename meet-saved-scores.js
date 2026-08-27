const savedMeetScoresKey='lane-lines-saved-meet-scores-v1';
function savedMeetScores(){try{const values=JSON.parse(localStorage.getItem(savedMeetScoresKey)||'[]');return Array.isArray(values)?values:[]}catch{return []}}
function writeSavedMeetScores(values){localStorage.setItem(savedMeetScoresKey,JSON.stringify(values))}
function ensureMeetScoreStorage(){let area=$('#meet-score-storage');if(area)return area;area=document.createElement('section');area.id='meet-score-storage';area.className='meet-score-storage';$('.dual-meet-sheet .section-heading').insertAdjacentElement('afterend',area);return area}
function renderMeetScoreStorage(){const area=ensureMeetScoreStorage(),name=dualMeet().meetName||'';area.innerHTML=`<label>MEET NAME<input id="meet-score-name" maxlength="80" value="${escapeHtml(name)}" placeholder="e.g. Lane Lines vs Riverview" /></label><span class="meet-score-file-message">Save this meet to a JSON file, or load a meet score from a JSON file.</span>`}
const renderDualMeetWithSavedScores=renderDualMeet;
renderDualMeet=function(){renderDualMeetWithSavedScores();renderMeetScoreStorage()};
renderMeetScoreStorage();
