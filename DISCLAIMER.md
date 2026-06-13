# Disclaimer

This software is provided **AS-IS**, without warranty of any kind, express or implied. See the [LICENSE](LICENSE) file for the full Apache 2.0 terms (notably §7 and §8 — Warranty and Liability).

---

## Intended use

stingray is a **counter-intelligence tool**. Its purpose is to give citizens, journalists, lawyers, opposition politicians, dissidents, whistleblowers, and activists a way to communicate that cannot be intercepted by the **illegal or extra-judicial use** of IMSI catchers and cell-site simulators by state-level or state-grade actors.

See [README.md "Position: counter-intelligence, not crime"](README.md) for the full statement.

---

## Acceptable use

By using stingray you agree that:

- You will **not** use this software in connection with any criminal activity.
- You will **not** use this software to plan, coordinate, or facilitate harm to other people.
- You will comply with the laws of your jurisdiction regarding the import, possession, use, and re-export of encryption software (see "Export control" below).
- The authors and maintainers are not responsible for, and do not endorse, any use of this software outside the stated counter-intelligence purpose.

The maintainers will refuse to acknowledge or engage with forks that publicly market the tool for criminal use.

---

## No warranty

This is **alpha software**. It has not been formally audited. It may contain bugs that weaken its security properties. **Do not rely on it as your sole defence against a state-level adversary today.**

To the maximum extent permitted by applicable law, the authors and maintainers shall not be liable for any damages — direct, indirect, incidental, special, exemplary, or consequential — arising from your use of this software. This includes (without limitation) damages for loss of data, loss of communications, loss of property, loss of liberty, or any other loss whatsoever, even if the authors have been advised of the possibility of such damages.

See [LICENSE](LICENSE) §7 (Disclaimer of Warranty) and §8 (Limitation of Liability) for the formal terms.

---

## No safe-harbour claim

Nothing in this software provides legal safe harbour.

If a court in your jurisdiction orders you to disclose your passphrase or to produce your communications, **the technical design of this software does not exempt you from that order**.

We have intentionally designed the system so that **we** cannot disclose your data even under legal compulsion (we do not have it). You can. Whether you must, and what the consequences are if you refuse, is a question for a lawyer in your jurisdiction — not a question this software answers.

---

## Export control

This distribution includes cryptographic software. The country in which you currently reside may have restrictions on the **import, possession, use, and/or re-export** of encryption software. Before using this software, please check your country's laws, regulations, and policies concerning encryption.

For the international export-control framework, see <https://www.wassenaar.org>.

The cryptographic primitives used by this software (X25519, Ed25519, XSalsa20-Poly1305, BLAKE2b, Argon2id) are widely-deployed public-domain or open-source algorithms that fall within broad export-licence exceptions in most jurisdictions — but it remains your responsibility to verify compliance with your local law.

This software is distributed in good faith. We make no representation that it is lawful to import, possess, or use in your country.

---

## Threat-model honesty

stingray defends against the specific class of adversary described in [docs/threat_model.md](docs/threat_model.md). It does NOT defend against:

- A compromised device with kernel-level malware already installed
- A sustained nation-state actor with custom implants on your hardware
- RAM extraction from a powered-on, unlocked device
- The user themselves (screenshots, photos of the screen)
- Legal compulsion to reveal the passphrase
- Quantum-computer breaks of X25519 (post-quantum primitives are on the roadmap)
- Side-channel attacks on the underlying cryptographic libraries

If your safety depends on defeating any of those, **you need additional, complementary defences** that this software does not provide.

---

## Status

This is **pure alpha**. It is **released for community feedback**, not for production use.

The reason it is published in this form is that the architecture and the threat model need scrutiny while the design can still change cheaply. Issues you find now are extremely valuable — see [SECURITY.md](SECURITY.md) for the disclosure path.

---

## Contact

For security-sensitive findings, follow [SECURITY.md](SECURITY.md). For general questions, open an issue on the repository.

For licensing or use-policy clarification, the authoritative documents are [LICENSE](LICENSE), [README.md "Position: counter-intelligence, not crime"](README.md), and this file. If any of them conflict, the LICENSE governs.
