import { getPair, getPairsForPatient, getPatient, getTrial, getWorklist } from "@/app/_data/source";
import { clinicFocus, diagnosisLine } from "@/components/hcp/clinic";
import { attributePatients } from "@/components/worklist/attribution";
import { rankPatientTrials, suggestPeers, type Peer } from "./rank";

export type ListedTrial = {
  nctId: string;
  title: string;
  unknownCount: number;
  eliminated: boolean;
};

export function listedTrials(patientId: string): ListedTrial[] {
  return rankPatientTrials(getPairsForPatient(patientId)).map((pair) => ({
    nctId: pair.nctId,
    title: getTrial(pair.nctId)?.title ?? pair.nctId,
    unknownCount: pair.unknownCount,
    eliminated: pair.eliminated,
  }));
}

function peerOf(patientId: string, nctId: string): Peer {
  const patient = getPatient(patientId);
  const trial = getTrial(nctId);
  const pair = nctId ? getPair(patientId, nctId) : undefined;
  const focus = pair && trial ? clinicFocus(pair, trial) : undefined;
  return {
    patientId,
    name: patientId,
    nctId,
    blockingId: focus?.leaf.id,
    diagnosis: patient ? diagnosisLine(patient) : undefined,
  };
}

/** Other patients on this physician's panel who share a blocker or a diagnosis. */
export function panelSuggestions(patientId: string, nctId: string, physicianId: string): Peer[] {
  const worklist = getWorklist();
  const mine = attributePatients(worklist.map((row) => row.patientId)).filter(
    (row) => row.physicianId === physicianId,
  );
  const peers = mine
    .filter((row) => row.patientId !== patientId)
    .map((row) => {
      const listed = worklist.find((item) => item.patientId === row.patientId);
      return peerOf(row.patientId, listed?.nctId ?? nctId);
    });
  return suggestPeers(peerOf(patientId, nctId), peers);
}
