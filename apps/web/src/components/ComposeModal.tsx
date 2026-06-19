import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPaperclip, IconX } from '@tabler/icons-react';
import {
  MAX_SEND_ATTACHMENTS,
  MAX_SEND_ATTACHMENTS_BYTES,
  MAX_SEND_ATTACHMENT_BYTES,
  type SendAttachment,
} from '@jmail/shared';
import { useEffect, useState } from 'react';
import { useContacts } from '../hooks/useContacts';
import { useSendMessage } from '../hooks/useMail';

export interface ComposeDraft {
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyToUid: number | null;
  inReplyToFolder: string | null;
}

export const EMPTY_DRAFT: ComposeDraft = {
  to: '',
  cc: '',
  subject: '',
  body: '',
  inReplyToUid: null,
  inReplyToFolder: null,
};

function parseAddresses(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

type ComposeAttachment = SendAttachment & { id: string };

export function ComposeModal({
  opened,
  draft,
  onClose,
}: {
  opened: boolean;
  draft: ComposeDraft;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ComposeDraft>(draft);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [isAttaching, setIsAttaching] = useState(false);
  const send = useSendMessage();
  const contacts = useContacts();
  const contactOptions = (contacts.data?.contacts ?? []).map((contact) => ({
    value: contact.email,
    label: `${contact.displayName} <${contact.email}>`,
  }));

  // Reset the form whenever a new draft is opened.
  useEffect(() => {
    if (opened) {
      setForm(draft);
      setTo(parseAddresses(draft.to));
      setCc(parseAddresses(draft.cc));
      setAttachments([]);
    }
  }, [opened, draft]);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const nextFiles = Array.from(files);
    if (attachments.length + nextFiles.length > MAX_SEND_ATTACHMENTS) {
      notifications.show({
        color: 'red',
        message: `Attach up to ${MAX_SEND_ATTACHMENTS} files per message.`,
      });
      return;
    }

    const oversized = nextFiles.find((file) => file.size > MAX_SEND_ATTACHMENT_BYTES);
    if (oversized) {
      notifications.show({
        color: 'red',
        message: `${oversized.name} is larger than ${formatBytes(MAX_SEND_ATTACHMENT_BYTES)}.`,
      });
      return;
    }

    const totalSize =
      attachments.reduce((total, attachment) => total + attachment.size, 0) +
      nextFiles.reduce((total, file) => total + file.size, 0);
    if (totalSize > MAX_SEND_ATTACHMENTS_BYTES) {
      notifications.show({
        color: 'red',
        message: `Attachments can total up to ${formatBytes(MAX_SEND_ATTACHMENTS_BYTES)}.`,
      });
      return;
    }

    setIsAttaching(true);
    try {
      const encoded = await Promise.all(
        nextFiles.map(async (file) => ({
          id: crypto.randomUUID(),
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          contentBase64: await readFileBase64(file),
        })),
      );
      setAttachments((current) => [...current, ...encoded]);
    } catch {
      notifications.show({ color: 'red', message: 'Failed to attach one or more files.' });
    } finally {
      setIsAttaching(false);
    }
  };

  const submit = () => {
    if (to.length === 0) {
      notifications.show({ color: 'red', message: 'At least one recipient is required.' });
      return;
    }
    send.mutate(
      {
        to,
        cc,
        bcc: [],
        subject: form.subject,
        text: form.body,
        html: null,
        attachments: attachments.map(({ id: _id, ...attachment }) => attachment),
        inReplyToUid: form.inReplyToUid,
        inReplyToFolder: form.inReplyToFolder,
      },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: 'Message sent.' });
          onClose();
        },
        onError: () => notifications.show({ color: 'red', message: 'Failed to send message.' }),
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New message" size="lg">
      <Stack>
        <TagsInput
          label="To"
          placeholder="recipient@example.com, another@example.com"
          data={contactOptions}
          value={to}
          onChange={setTo}
          splitChars={[',', ';']}
          clearable
        />
        <TagsInput
          label="Cc"
          data={contactOptions}
          value={cc}
          onChange={setCc}
          splitChars={[',', ';']}
          clearable
        />
        <TextInput
          label="Subject"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.currentTarget.value })}
        />
        <Textarea
          label="Message"
          autosize
          minRows={10}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.currentTarget.value })}
        />
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Button
              component="label"
              variant="default"
              leftSection={<IconPaperclip size={16} />}
              loading={isAttaching}
            >
              Attach files
              <input
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  void addFiles(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
            </Button>
            {attachments.length > 0 ? (
              <Text size="sm" c="dimmed">
                {attachments.length} file{attachments.length === 1 ? '' : 's'} ·{' '}
                {formatBytes(attachments.reduce((total, attachment) => total + attachment.size, 0))}
              </Text>
            ) : null}
          </Group>
          {attachments.map((attachment) => (
            <Group key={attachment.id} justify="space-between" gap="sm" wrap="nowrap">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <IconPaperclip size={16} />
                <Text size="sm" truncate>
                  {attachment.filename}
                </Text>
                <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                  {formatBytes(attachment.size)}
                </Text>
              </Group>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`Remove ${attachment.filename}`}
                onClick={() =>
                  setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                }
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={send.isPending} disabled={isAttaching}>
            Send
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
