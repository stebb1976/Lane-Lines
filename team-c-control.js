const renderDualMeetWithTeamCControl=renderDualMeet;
renderDualMeet=function(){renderDualMeetWithTeamCControl();const doubleDual=dualMeet().type==='double-dual';$('#dual-team-c-label').hidden=false;$('#dual-team-c').disabled=!doubleDual};
renderDualMeet();
