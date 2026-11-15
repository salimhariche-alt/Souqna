import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RequireAuth } from '@/components/require-auth';

/** Placeholder: editing a listing is built in a later step. */
export default function EditListingScreen() {
  return (
    <RequireAuth next="/profile">
      <PlaceholderScreen titleKey="listing.editTitle" />
    </RequireAuth>
  );
}
