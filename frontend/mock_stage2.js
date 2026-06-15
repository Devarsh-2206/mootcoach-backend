window.mockStage2 = function() {
   console.log("MOCKING STAGE 2");
   const data = {
      issueIntelligence: {
         issues: [
            { issueDefinition: { exactLegalQuestion: "Is the Tribunal's jurisdiction established?" }, stances: { petitioner: { coreSubmission: "Yes" }, respondent: { coreSubmission: "No" } } },
            { issueDefinition: { exactLegalQuestion: "Did the State violate Fair and Equitable Treatment?" }, stances: { petitioner: { coreSubmission: "Yes" }, respondent: { coreSubmission: "No" } } }
         ]
      }
   };
   document.getElementById('auth-overlay').style.display = 'none';
   document.getElementById('view-workspace').classList.remove('hidden');
   document.getElementById('view-workspace').classList.add('active');
   
   // Force show stage 2
   document.querySelectorAll('.ws-stage').forEach(s => {
     s.style.display = 'none';
     s.classList.remove('active');
   });
   const s2 = document.getElementById('stage-2-container');
   s2.style.display = 'flex';
   s2.classList.add('active');

   import('./js/components/issueWorkspace.js').then(module => {
      module.populateIssueStack(data);
   });
};
