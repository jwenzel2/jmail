import { useLocalStorage } from '@mantine/hooks';

export const DEFAULT_MAIL_PAGE_SIZE = 50;
export const MAIL_PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export type MailPageSize = (typeof MAIL_PAGE_SIZE_OPTIONS)[number];

function normalizePageSize(value: number): MailPageSize {
  return MAIL_PAGE_SIZE_OPTIONS.includes(value as MailPageSize)
    ? (value as MailPageSize)
    : DEFAULT_MAIL_PAGE_SIZE;
}

export function useMailPageSize(): [MailPageSize, (value: number) => void] {
  const [stored, setStored] = useLocalStorage<number>({
    key: 'jmail.mail.pageSize',
    defaultValue: DEFAULT_MAIL_PAGE_SIZE,
  });

  return [normalizePageSize(stored), (value: number) => setStored(normalizePageSize(value))];
}
