import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RequireAuth } from '@/components/require-auth';

export default function MessagesScreen() {
  return (
    <RequireAuth next="/messages">
      <PlaceholderScreen titleKey="tabs.messages" />
    </RequireAuth>
  );
}
