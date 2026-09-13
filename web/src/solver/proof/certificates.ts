import { isCheckedCertificate, verifyCertificate, certificateImportsMatch } from "./checker";
import { requireProof, sameValue } from "./primitives";
import { ImmutableMap } from "../state/facts";
import type { CertificateEvent, CheckContext, CheckedCertificate, DeductionProposal } from "./types";

/**
 * Non-applying primitive-proof session. Its retained nodes have certificate-only
 * identity; production checkProposal rejects them, and candidate ownership never
 * changes. Useful for independently checking local algebra before a family exists.
 */
export class CertificateSession {
  #context: CheckContext;
  constructor(context: CheckContext) { this.#context = Object.freeze({ ...context, retained: new ImmutableMap(context.retained) }); }
  get context(): CheckContext { return this.#context; }
  verify(proposal: DeductionProposal): Generator<CertificateEvent, void, void> { return verifyCertificate(proposal, this.#context); }
  retain(certificate: CheckedCertificate): void {
    requireProof(isCheckedCertificate(certificate) && sameValue(certificate.proposal.state, this.#context.view.state.key), "inauthentic-certificate");
    requireProof(certificateImportsMatch(certificate, this.#context.retained), "substituted-certificate-import");
    const nodes = new Map(this.#context.retained);
    for (const node of certificate.proposal.proof.nodes) {
      requireProof(!nodes.has(node.id), "reused-certificate-node"); nodes.set(node.id, node);
    }
    // Reverification binds every import to this exact session, including tables.
    const event = [...this.verify(certificate.proposal)].at(-1);
    requireProof(event?.kind === "verified", "substituted-certificate-import");
    this.#context = Object.freeze({ ...this.#context, retained: new ImmutableMap(nodes) });
  }
}
