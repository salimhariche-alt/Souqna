import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RequireAuth } from '@/components/require-auth';

export default function SellScreen() {
  return (
    <RequireAuth next="/sell">
      <PlaceholderScreen titleKey="tabs.sell" />
    </RequireAuth>
  );
}
