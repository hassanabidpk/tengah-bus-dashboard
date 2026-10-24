export interface DepartureGuidance {
  index: number;
  arrivalMins: number;
  leaveInMins: number;
  status: 'leave-now' | 'plan';
}

// Allow one extra minute for boarding and rounded feed estimates.
export const BOARDING_BUFFER_MINS = 1;

export function getDepartureGuidance(
  timings: ReadonlyArray<{ mins: number | 'Arr' }>,
  walkTime: number,
): DepartureGuidance | null {
  if (!Number.isFinite(walkTime) || walkTime < 0) return null;
  let best: DepartureGuidance | null = null;
  timings.forEach((timing, index) => {
    if (timing.mins === 'Arr' || !Number.isFinite(timing.mins)) return;
    const leaveInMins = timing.mins - walkTime - BOARDING_BUFFER_MINS;
    if (leaveInMins < 0 || (best && timing.mins >= best.arrivalMins)) return;
    best = {
      index,
      arrivalMins: timing.mins,
      leaveInMins,
      status: leaveInMins <= 3 ? 'leave-now' : 'plan',
    };
  });
  return best;
}
