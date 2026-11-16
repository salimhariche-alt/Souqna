import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RequireAuth } from '@/components/require-auth';

export default function SellScreen() {
  return (
    <RequireAuth next="/sell" verified>
      <PlaceholderScreen titleKey="tabs.sell" />
    </RequireAuth>
  );
}
