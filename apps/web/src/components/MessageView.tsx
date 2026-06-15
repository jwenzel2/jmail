import type { MessageDetail } from '@jmail/shared';
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDownload,
  IconExternalLink,
  IconMailCheck,
  IconMenu2,
  IconPaperclip,
  IconPhoto,
  IconShieldX,
  IconSourceCode,
  IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { attachmentUrl, messageSourceUrl, messageWindowUrl } from '../api/mail';
import { formatAddressFull, formatBytes, formatFullDate } from '../utils/format';

function buildSrcDoc(html: string, allowImages: boolean): string {
  const imgSrc = allowImages ? 'img-src http: https: data: cid:;' : 'img-src data:;';
  const csp = `default-src 'none'; ${imgSrc} style-src 'unsafe-inline'; font-src data:;`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:system-ui,sans-serif;margin:8px;color:#222;word-wrap:break-word}img{max-width:100%}a{color:#2f6fed}</style></head><body>${html}</body></html>`;
}

const REMOTE_RE = /src=["']https?:|url\(\s*['"]?https?:/i;

export function MessageView({
  message,
  isJunk,
  onReply,
  onForward,
  onDelete,
  onMarkSpam,
  onNotSpam,
  standalone = false,
}: {
  message: MessageDetail;
  isJunk: boolean;
  onReply: (m: MessageDetail) => void;
  onForward: (m: MessageDetail) => void;
  onDelete: (m: MessageDetail) => void;
  onMarkSpam: (m: MessageDetail) => void;
  onNotSpam: (m: MessageDetail) => void;
  standalone?: boolean;
}) {
  const [showImages, setShowImages] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const hasRemote = useMemo(
    () => (message.html ? REMOTE_RE.test(message.html) : false),
    [message.html],
  );
  const visibleAttachments = message.attachments.filter((a) => !a.inline || a.filename);

  return (
    <Stack gap={0} h="100%">
      <Box p="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Title order={4} style={{ flex: 1 }}>
            {message.subject || '(no subject)'}
          </Title>
          <Group gap={4} wrap="nowrap">
            {!standalone ? (
              <>
                <Tooltip label="Reply">
                  <ActionIcon variant="subtle" onClick={() => onReply(message)}>
                    <IconArrowBackUp size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Forward">
                  <ActionIcon variant="subtle" onClick={() => onForward(message)}>
                    <IconArrowForwardUp size={18} />
                  </ActionIcon>
                </Tooltip>
              </>
            ) : null}
            <Menu position="bottom-end" withArrow>
              <Menu.Target>
                <Tooltip label="More">
                  <ActionIcon variant="subtle">
                    <IconMenu2 size={18} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                {!standalone ? (
                  <Menu.Item
                    leftSection={<IconExternalLink size={16} />}
                    onClick={() =>
                      window.open(
                        messageWindowUrl(message.folder, message.uid),
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    Open in new window
                  </Menu.Item>
                ) : null}
                <Menu.Item
                  leftSection={<IconSourceCode size={16} />}
                  onClick={() => setShowHeaders(true)}
                >
                  View message headers
                </Menu.Item>
                <Menu.Item
                  component="a"
                  href={messageSourceUrl(message.folder, message.uid)}
                  download
                  leftSection={<IconDownload size={16} />}
                >
                  Download message (.eml)
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            {!standalone && isJunk ? (
              <Tooltip label="Not spam (move to Inbox)">
                <ActionIcon variant="subtle" color="green" onClick={() => onNotSpam(message)}>
                  <IconMailCheck size={18} />
                </ActionIcon>
              </Tooltip>
            ) : !standalone ? (
              <Tooltip label="Mark as spam (move to Junk)">
                <ActionIcon variant="subtle" color="orange" onClick={() => onMarkSpam(message)}>
                  <IconShieldX size={18} />
                </ActionIcon>
              </Tooltip>
            ) : null}
            {!standalone ? (
              <Tooltip label="Delete">
                <ActionIcon variant="subtle" color="red" onClick={() => onDelete(message)}>
                  <IconTrash size={18} />
                </ActionIcon>
              </Tooltip>
            ) : null}
          </Group>
        </Group>
        <Group gap="xs" mt={6}>
          <Text size="sm" fw={600}>
            {message.from.map(formatAddressFull).join(', ')}
          </Text>
          <Text size="xs" c="dimmed">
            {formatFullDate(message.date)}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          To: {message.to.map(formatAddressFull).join(', ') || '(undisclosed)'}
        </Text>
      </Box>

      <Divider />

      {hasRemote && !showImages ? (
        <Alert
          color="yellow"
          radius={0}
          icon={<IconPhoto size={18} />}
          title="Remote images blocked"
        >
          <Group justify="space-between">
            <Text size="sm">This message contains remote images, which can track you.</Text>
            <Button size="xs" variant="light" onClick={() => setShowImages(true)}>
              Load images
            </Button>
          </Group>
        </Alert>
      ) : null}

      <Box style={{ flex: 1, minHeight: 0 }}>
        {message.html ? (
          <iframe
            title="message body"
            srcDoc={buildSrcDoc(message.html, showImages)}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <Box component="pre" p="md" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {message.text ?? '(empty message)'}
          </Box>
        )}
      </Box>

      {visibleAttachments.length > 0 ? (
        <>
          <Divider />
          <Group p="sm" gap="sm">
            {visibleAttachments.map((a) => (
              <Anchor
                key={a.partId}
                href={attachmentUrl(message.folder, message.uid, a.partId)}
                download={a.filename ?? undefined}
                size="sm"
              >
                <Group gap={4} wrap="nowrap">
                  <IconPaperclip size={14} />
                  {a.filename ?? 'attachment'}
                  <Text span c="dimmed" size="xs">
                    ({formatBytes(a.size)})
                  </Text>
                </Group>
              </Anchor>
            ))}
          </Group>
        </>
      ) : null}

      <Modal
        opened={showHeaders}
        onClose={() => setShowHeaders(false)}
        title="Message headers"
        size="xl"
      >
        <Code block style={{ whiteSpace: 'pre-wrap', maxHeight: '70vh', overflow: 'auto' }}>
          {message.rawHeaders}
        </Code>
      </Modal>
    </Stack>
  );
}
