import { Button } from '@/ui';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  /** primary = terracotta, danger = the danger colour, secondary = cream with a border. */
  variant?: 'primary' | 'danger' | 'secondary';
};

/**
 * The main button of an older screen - now the design system's button (54 high,
 * corners 16, DM Sans 700). New code: use <Button> from '@/ui'.
 */
export function PrimaryButton({ title, onPress, loading = false, variant = 'primary' }: Props) {
  return (
    <Button
      title={title}
      onPress={onPress}
      loading={loading}
      variant={variant === 'secondary' ? 'outlined' : 'filled'}
      tone={variant === 'danger' ? 'danger' : 'brand'}
    />
  );
}
