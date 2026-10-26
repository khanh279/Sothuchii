import { part1 } from '@/i18n/en/part1';
import { part2 } from '@/i18n/en/part2';
import { part3 } from '@/i18n/en/part3';
import { part4 } from '@/i18n/en/part4';
import { part5 } from '@/i18n/en/part5';
import { registerEnglish } from '@/i18n/translate';

registerEnglish({ ...part1, ...part2, ...part3, ...part4, ...part5 });
