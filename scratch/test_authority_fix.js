const fs = require('fs');

// We will test the object shapes
function getTrimmedInputs(propositionIntelligence, proceduralHierarchy, forumIntelligence, issueIntelligence, forumContext) {
  const authorityInputProp = {
    factualMatrix: propositionIntelligence?.factualMatrix
  };
  const authorityInputForum = {
    forum: forumContext?.forum || forumIntelligence?.forumIndicators,
    jurisdiction: forumContext?.jurisdiction || forumIntelligence?.jurisdictionSignals,
    governingLaw: forumContext?.governingLaw || forumIntelligence?.governingLaw
  };
  const authorityInputIssue = {
    issues: (issueIntelligence?.issues || []).map(i => ({
      issue: i.issueDefinition?.exactLegalQuestion,
      petitionerTheory: i.petitionerFramework?.coreTheory,
      respondentTheory: i.respondentFramework?.coreTheory,
      authorityRequirements: i.authorityRequirements
    }))
  };

  const raw1 = JSON.stringify(propositionIntelligence);
  const raw2 = JSON.stringify(proceduralHierarchy);
  const raw3 = JSON.stringify(forumIntelligence);
  const raw4 = JSON.stringify(issueIntelligence);
  const rawTotal = (raw1.length + raw2.length + raw3.length + raw4.length) / 4;

  const trim1 = JSON.stringify(authorityInputProp);
  const trim3 = JSON.stringify(authorityInputForum);
  const trim4 = JSON.stringify(authorityInputIssue);
  const trimTotal = (trim1.length + trim3.length + trim4.length) / 4;

  console.log("Original token est:", rawTotal);
  console.log("Trimmed token est:", trimTotal);
}

console.log("Script loaded");
