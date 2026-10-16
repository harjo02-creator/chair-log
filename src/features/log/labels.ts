import { SOURCE_LABEL, type Source, type VisitType } from '../../domain/types';

export const VISIT_TYPE_OPTIONS: { value: VisitType; label: string }[] = [
  { value: 'NEW_CONSULT', label: 'New consult' },
  { value: 'REPEAT', label: 'Repeat' },
];

export const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: 'CLINIC_LEAD', label: 'Clinic lead' },
  { value: 'SELF_SOURCED', label: 'Self-sourced' },
  { value: 'REFERRAL', label: 'Referral (word of mouth)' },
];

export const REBOOK_LABEL: Record<number, string> = {
  14: '2 weeks (touch-up)',
  42: '6 weeks',
  90: '90 days',
  120: '4 months',
  180: '6 months',
  365: '12 months',
};

export const sourceLabel = (s: Source) => SOURCE_LABEL[s];
