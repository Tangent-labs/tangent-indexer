import SnapShotVoteService from "../services/SnapShotVoteService"

async function checkVotes() {
  try {
    const snapshotService = new SnapShotVoteService()

    // const test = await snapshotService.test()
    // console.log(test)

    // Example: fetch proposals for cvx.eth organization
    const proposals = await snapshotService.listProposals()

    console.log("Fetched proposals:", proposals.length)
    console.log(JSON.stringify(proposals, null, 2))

    for (const proposal of proposals) {
      const votes = await snapshotService.getProposalVotes(proposal)
      //
      console.log(votes)
    }
  } catch (error) {
    console.error("Error checking votes:", error)
  }
}

// Run the script
checkVotes()
