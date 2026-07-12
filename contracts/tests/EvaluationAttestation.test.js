const { expect } = require("chai");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Mirrors CertificationAttestation.test.js's deployLifecycle(): deploy the diamond, cut in all
// seven facets (including LifecycleEvaluation), initialize(). Returns the diamond address + signers.
async function deployLifecycle() {
  const [admin, dev, evaluator] = await hre.ethers.getSigners();

  const RouterAdmin = await hre.ethers.getContractFactory("RouterAdmin");
  const routerAdmin = await RouterAdmin.deploy();
  await routerAdmin.waitForDeployment();

  const Lifecycle = await hre.ethers.getContractFactory("SMARTLifecycle");
  const diamond = await Lifecycle.deploy(admin.address, await routerAdmin.getAddress());
  await diamond.waitForDeployment();
  const diamondAddr = await diamond.getAddress();

  const cut = await hre.ethers.getContractAt("RouterAdmin", diamondAddr);
  const modNames = [
    "RouterIntrospection", "LifecycleCore", "LifecycleQuorum",
    "LifecycleAdmin", "LifecycleNFT", "LifecycleLineage", "LifecycleEvaluation",
  ];
  const cuts = [];
  for (const name of modNames) {
    const F = await hre.ethers.getContractFactory(name);
    const m = await F.deploy();
    await m.waitForDeployment();
    const selectors = F.interface.fragments
      .filter(f => f.type === "function")
      .map(f => f.selector);
    cuts.push({ moduleAddress: await m.getAddress(), action: 0, functionSelectors: selectors });
  }
  await (await cut.routerCut(cuts, hre.ethers.ZeroAddress, "0x")).wait();

  const adminFacet = await hre.ethers.getContractAt("LifecycleAdmin", diamondAddr);
  await (await adminFacet.initialize(admin.address, "SMART Model Card", "SMART")).wait();

  return { diamond: diamondAddr, admin, dev, evaluator };
}

describe("attestEvaluationVerdict", function () {
  it("lets an EVALUATOR_ROLE holder attest an active (unpublished) card and emits the event", async function () {
    const { diamond, admin } = await deployLifecycle();
    const core = await hre.ethers.getContractAt("LifecycleCore", diamond);
    const evalF = await hre.ethers.getContractAt("LifecycleEvaluation", diamond);
    const adminF = await hre.ethers.getContractAt("LifecycleAdmin", diamond);

    const DEV = hre.ethers.id("DEVELOPER_ROLE");
    const EVAL = hre.ethers.id("EVALUATOR_ROLE");
    await (await adminF.grantRole(DEV, admin.address)).wait();
    await (await adminF.grantRole(EVAL, admin.address)).wait();

    const contentHash = hre.ethers.id("card-eval-1");
    await (await core.createModelCard(admin.address, "ipfs://x", contentHash)).wait();
    const tokenId = 1;

    const verdictDigest = hre.ethers.id("sha256:verdict");
    const modelDigest = hre.ethers.id("sha256:model");

    // active-but-NOT-Published: attest right after creation (no submit/validate/publish)
    await expect(evalF.attestEvaluationVerdict(tokenId, verdictDigest, modelDigest, 0))
      .to.emit(evalF, "EvaluationVerdictAttested")
      .withArgs(tokenId, admin.address, verdictDigest, modelDigest, 0, anyUint);
  });

  it("reverts when a non-evaluator calls it", async function () {
    const { diamond, admin, evaluator } = await deployLifecycle();
    const core = await hre.ethers.getContractAt("LifecycleCore", diamond);
    const evalF = await hre.ethers.getContractAt("LifecycleEvaluation", diamond);
    const adminF = await hre.ethers.getContractAt("LifecycleAdmin", diamond);

    await (await adminF.grantRole(hre.ethers.id("DEVELOPER_ROLE"), admin.address)).wait();
    await (await core.createModelCard(admin.address, "ipfs://x", hre.ethers.id("card-eval-2"))).wait();

    // evaluator signer was granted NOTHING
    await expect(
      evalF.connect(evaluator).attestEvaluationVerdict(1, hre.ethers.id("d"), hre.ethers.id("m"), 0)
    ).to.be.reverted;
  });

  it("reverts on zero verdictDigest or zero modelDigest", async function () {
    const { diamond, admin } = await deployLifecycle();
    const core = await hre.ethers.getContractAt("LifecycleCore", diamond);
    const evalF = await hre.ethers.getContractAt("LifecycleEvaluation", diamond);
    const adminF = await hre.ethers.getContractAt("LifecycleAdmin", diamond);

    await (await adminF.grantRole(hre.ethers.id("DEVELOPER_ROLE"), admin.address)).wait();
    await (await adminF.grantRole(hre.ethers.id("EVALUATOR_ROLE"), admin.address)).wait();
    await (await core.createModelCard(admin.address, "ipfs://x", hre.ethers.id("card-eval-3"))).wait();

    await expect(evalF.attestEvaluationVerdict(1, hre.ethers.id("d"), hre.ethers.ZeroHash, 0))
      .to.be.revertedWith("Model digest required");
    await expect(evalF.attestEvaluationVerdict(1, hre.ethers.ZeroHash, hre.ethers.id("m"), 0))
      .to.be.revertedWith("Verdict digest required");
  });

  it("records overall verdicts 1 and 2 as well as 0", async function () {
    const { diamond, admin } = await deployLifecycle();
    const core = await hre.ethers.getContractAt("LifecycleCore", diamond);
    const evalF = await hre.ethers.getContractAt("LifecycleEvaluation", diamond);
    const adminF = await hre.ethers.getContractAt("LifecycleAdmin", diamond);

    await (await adminF.grantRole(hre.ethers.id("DEVELOPER_ROLE"), admin.address)).wait();
    await (await adminF.grantRole(hre.ethers.id("EVALUATOR_ROLE"), admin.address)).wait();
    await (await core.createModelCard(admin.address, "ipfs://x", hre.ethers.id("card-eval-4"))).wait();

    await expect(evalF.attestEvaluationVerdict(1, hre.ethers.id("d"), hre.ethers.id("m"), 1))
      .to.emit(evalF, "EvaluationVerdictAttested")
      .withArgs(1, admin.address, hre.ethers.id("d"), hre.ethers.id("m"), 1, anyUint);

    await expect(evalF.attestEvaluationVerdict(1, hre.ethers.id("d2"), hre.ethers.id("m2"), 2))
      .to.emit(evalF, "EvaluationVerdictAttested")
      .withArgs(1, admin.address, hre.ethers.id("d2"), hre.ethers.id("m2"), 2, anyUint);
  });
});
