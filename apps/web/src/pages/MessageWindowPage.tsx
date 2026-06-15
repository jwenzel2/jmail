import { Center, Loader, Text } from '@mantine/core';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MessageView } from '../components/MessageView';
import { useMessage } from '../hooks/useMail';

export function MessageWindowPage() {
  const params = useParams<{ folder: string; uid: string }>();
  const folder = params.folder ?? null;
  const uid = Number(params.uid);
  const message = useMessage(folder, Number.isInteger(uid) && uid > 0 ? uid : null);

  useEffect(() => {
    if (message.data) document.title = message.data.subject || '(no subject)';
  }, [message.data]);

  if (message.isLoading) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }

  if (!message.data) {
    return (
      <Center mih="100vh">
        <Text c="dimmed">Message not found</Text>
      </Center>
    );
  }

  return (
    <div style={{ height: '100vh' }}>
      <MessageView
        message={message.data}
        isJunk={false}
        standalone
        onReply={() => undefined}
        onForward={() => undefined}
        onDelete={() => undefined}
        onMarkSpam={() => undefined}
        onNotSpam={() => undefined}
      />
    </div>
  );
}
