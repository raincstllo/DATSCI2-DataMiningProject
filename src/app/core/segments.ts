import { SegmentName } from './api.models';

/** Plain-language names for the K-Means segments, as the owner sees them. */
export const SEGMENT_LABELS: Record<SegmentName, string> = {
  Frequent: 'Regulars',
  Infrequent: 'Occasional',
  Inactive: "Haven't returned",
};

export const SEGMENT_DESCRIPTIONS: Record<SegmentName, string> = {
  Frequent: 'Come often and spend the most.',
  Infrequent: 'Visited once or twice recently.',
  Inactive: 'No visit in a long time.',
};

export const SEGMENT_ACTIONS: Record<SegmentName, string> = {
  Frequent: 'Thank them, remind them of routine cleanings, and give them priority slots.',
  Infrequent: 'Send a check-up reminder around 6 months after their last visit.',
  Inactive: 'Call or message them personally to invite them back for a check-up.',
};
