const renderDualMeetWithTeamCControl=renderDualMeet;
renderDualMeet=function(){renderDualMeetWithTeamCControl();const doubleDual=dualMeet().type==='double-dual',field=$('#dual-team-c'),label=$('#dual-team-c-label');label.hidden=false;field.disabled=!doubleDual;field.style.backgroundColor=doubleDual?'':'#e1e7ea';field.style.color=doubleDual?'':'#788991';label.style.opacity=doubleDual?'1':'.7'};
renderDualMeet();
