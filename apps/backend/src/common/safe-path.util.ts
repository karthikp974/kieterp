import { resolve, sep } from "path";

/**
 * Defence-in-depth path confinement for file serving.
 *
 * Even though stored file keys are server-generated, we resolve the final path
 * and confirm it stays inside the intended upload root before streaming, so a
 * malformed or tampered key can never traverse outside the uploads directory.
 */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + sep);
}
