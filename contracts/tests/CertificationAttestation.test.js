const { expect } = require("chai");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Mirrors HTAAttestation.test.js's deployLifecycle(): deploy the diamond, cut in all
// six facets, initialize(). Returns the diamond address + signers.
async function deployLifecycle() {
  const [admin, dev, certifier] = await hre.ethers.getSigners();

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

  return { diamond: diamondAddr, admin, dev, certifier };
}

describe("attestCertification", function () {
  it("lets a CERTIFIER_ROLE holder attest an active (unpublished) card and emits the event", async function () {
    const { diamond, admin } = await deployLifecycle();
    const core = await hre.ethers.getContractAt("LifecycleCore", diamond);
    const adminF = await hre.ethers.getContractAt("LifecycleAdmin", diamond);

    const DEV = hre.ethers.id("DEVELOPER_ROLE");
    const CERT = hre.ethers.id("CERTIFIER_ROLE");
    await (await adminF.grantRole(DEV, admin.address)).wait();
    await (await adminF.grantRole(CERT, admin.address)).wait();

    const contentHash = hre.ethers.id("card-cert-1");
    await (await core.createModelCard(admin.address, "ipfs://x", contentHash)).wait();
    const tokenId = 1;

    const imageDigest = hre.ethers.id("sha256:image");
    const certHash = hre.ethers.id("signed-cert-bytes");

    // active-but-NOT-Published: attest right after creation (no submit/validate/publish)
    await expect(core.attestCertification(tokenId, imageDigest, certHash, 0))
      .to.emit(core, "CertificationAttested")
      .withArgs(tokenId, admin.address, imageDigest, certHash, 0, anyUint);
  });

  it("reverts when a non-certifier calls it", async function () {
    const { diamond, admin, dev, certifier } = await deployLifecycle();
    const core = await hre.ethers.getContractAt("LifecycleCore", diamond);
    const adminF = await hre.ethers.getContractAt("LifecycleAdmin", diamond);

    await (await adminF.grantRole(hre.ethers.id("DEVELOPER_ROLE"), admin.address)).wait();
    await (await core.createModelCard(admin.address, "ipfs://x", hre.ethers.id("card-cert-2"))).wait();

    // certifier signer was granted NOTHING
    await expect(
      core.connect(certifier).attestCertification(1, hre.ethers.id("d"), hre.ethers.id("c"), 0)
    ).to.be.reverted;
  });

  it("reverts on zero certHash or zero imageDigest", async function () {
    const { diamond, admin } = await deployLifecycle();
    const core = await hre.ethers.getContractAt("LifecycleCore", diamond);
    const adminF = await hre.ethers.getContractAt("LifecycleAdmin", diamond);

    await (await adminF.grantRole(hre.ethers.id("DEVELOPER_ROLE"), admin.address)).wait();
    await (await adminF.grantRole(hre.ethers.id("CERTIFIER_ROLE"), admin.address)).wait();
    await (await core.createModelCard(admin.address, "ipfs://x", hre.ethers.id("card-cert-3"))).wait();

    await expect(core.attestCertification(1, hre.ethers.id("d"), hre.ethers.ZeroHash, 0))
      .to.be.revertedWith("Cert hash required");
    await expect(core.attestCertification(1, hre.ethers.ZeroHash, hre.ethers.id("c"), 0))
      .to.be.revertedWith("Image digest required");
  });

  it("records a failed verdict (1) as well as certified (0)", async function () {
    const { diamond, admin } = await deployLifecycle();
    const core = await hre.ethers.getContractAt("LifecycleCore", diamond);
    const adminF = await hre.ethers.getContractAt("LifecycleAdmin", diamond);

    await (await adminF.grantRole(hre.ethers.id("DEVELOPER_ROLE"), admin.address)).wait();
    await (await adminF.grantRole(hre.ethers.id("CERTIFIER_ROLE"), admin.address)).wait();
    await (await core.createModelCard(admin.address, "ipfs://x", hre.ethers.id("card-cert-4"))).wait();

    await expect(core.attestCertification(1, hre.ethers.id("d"), hre.ethers.id("c"), 1))
      .to.emit(core, "CertificationAttested")
      .withArgs(1, admin.address, hre.ethers.id("d"), hre.ethers.id("c"), 1, anyUint);
  });
});
