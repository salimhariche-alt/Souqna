import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  CONDITIONS,
  createListing,
  deleteListingPhoto,
  orderListingPhotos,
  updateListing,
  uploadListingPhoto,
  type Condition,
  type ListingDetail,
  type ListingInput,
} from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { mainCategoriesInOrder } from '@/components/category-chips';
import { FormField } from '@/components/form-field';
import { MAX_PHOTOS, PhotoStrip, type FormPhoto } from '@/components/photo-strip';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { WilayaPicker } from '@/components/wilaya-picker';
import { Brand, Spacing } from '@/constants/theme';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { preparePhoto } from '@/photos/prepare';
import { usePhotoPicker } from '@/photos/use-photo-picker';
import { onlyDigits } from '@/utils/digits';

type Field = 'photos' | 'title' | 'description' | 'category' | 'size' | 'brand' | 'condition' | 'price' | 'wilaya';
type Errors = Partial<Record<Field, string>>;

/** Backend field name -> form field, to show the server's messages in the right place. */
const FIELD_MAP: Record<string, Field> = {
  title: 'title',
  description: 'description',
  category: 'category',
  size: 'size',
  brand: 'brand',
  condition: 'condition',
  price_dzd: 'price',
  wilaya: 'wilaya',
  image: 'photos',
};

type Props = {
  /** Editing an existing listing (filled in with its information); empty = a new listing. */
  initial?: ListingDetail;
  /** Called when everything is saved, with the listing's id. */
  onDone: (listingId: number) => void;
};

function inputFrom(listing: ListingDetail): ListingInput {
  return {
    title: listing.title,
    description: listing.description,
    category: listing.category,
    size: listing.size,
    brand: listing.brand,
    condition: listing.condition as Condition,
    price_dzd: listing.price_dzd,
    wilaya: listing.wilaya,
  };
}

/** The Sell form, also used to edit a listing. */
export function ListingForm({ initial, onDone }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { language, direction } = useLanguage();
  const { user } = useAuth();
  const { categories } = useCategories();
  const isEdit = initial !== undefined;

  // The form's contents.
  const [photos, setPhotos] = useState<FormPhoto[]>(
    () => initial?.photos.map((p) => ({ key: `remote-${p.id}`, uri: p.image, remoteId: p.id })) ?? [],
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<number | null>(initial?.category ?? null);
  const [size, setSize] = useState(initial?.size ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [condition, setCondition] = useState<Condition | null>(
    (initial?.condition as Condition | undefined) ?? null,
  );
  const [price, setPrice] = useState(initial ? String(initial.price_dzd) : '');
  const [wilaya, setWilaya] = useState<number | null>(initial?.wilaya ?? user?.wilaya ?? null);

  // Photos already online that the user removed (deleted on the server when saving).
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [generalError, setGeneralError] = useState<string>();
  const [failedOnce, setFailedOnce] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const busy = progress !== null;

  // What is already saved on the server, so "Try again" only sends what's missing.
  const listingId = useRef<number | null>(initial?.id ?? null);
  const savedDetails = useRef<string | null>(initial ? JSON.stringify(inputFrom(initial)) : null);
  const nextKey = useRef(0);

  const clearError = (field: Field) => setErrors((current) => ({ ...current, [field]: undefined }));
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left' } as const;

  // Photos ---------------------------------------------------------------------------
  const { pick, dialogs } = usePhotoPicker((picked) => {
    const room = MAX_PHOTOS - photos.length;
    const chosen = picked.slice(0, room);
    const added = chosen.map((p) => ({
      key: `local-${nextKey.current++}`,
      uri: p.uri,
      preparing: true,
    }));
    setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    clearError('photos');
    // Make each photo smaller now, so it's ready (and light) when the user publishes.
    added.forEach(async (photo, i) => {
      try {
        const ready = await preparePhoto(chosen[i]);
        setPhotos((current) =>
          current.map((p) => (p.key === photo.key ? { ...p, uri: ready.uri, preparing: false } : p)),
        );
      } catch {
        setPhotos((current) => current.filter((p) => p.key !== photo.key));
        setGeneralError(t('sell.photoFailed'));
      }
    });
  });

  const removePhoto = (key: string) => {
    const photo = photos.find((p) => p.key === key);
    if (photo?.remoteId !== undefined) setRemovedIds((ids) => [...ids, photo.remoteId!]);
    setPhotos((current) => current.filter((p) => p.key !== key));
  };

  const makeCover = (key: string) =>
    setPhotos((current) => {
      const photo = current.find((p) => p.key === key);
      return photo ? [photo, ...current.filter((p) => p.key !== key)] : current;
    });

  // Categories: main ones first; if the chosen one has sub-categories, show those too.
  const mainCategories = useMemo(() => mainCategoriesInOrder(categories), [categories]);
  const selected = categories.find((c) => c.id === category);
  const mainId = selected?.parent ?? selected?.id ?? null;
  const subCategories = categories.filter((c) => c.parent !== null && c.parent === mainId);

  // Checking and publishing ----------------------------------------------------------
  const validate = (): Errors => {
    const found: Errors = {};
    if (photos.length === 0) found.photos = t('sell.errors.photoRequired');
    if (!title.trim()) found.title = t('sell.errors.titleRequired');
    if (category === null) found.category = t('sell.errors.categoryRequired');
    if (condition === null) found.condition = t('sell.errors.conditionRequired');
    if (!price) found.price = t('sell.errors.priceRequired');
    if (wilaya === null) found.wilaya = t('errors.wilayaRequired');
    return found;
  };

  const publish = async () => {
    setGeneralError(undefined);
    if (photos.some((p) => p.preparing)) {
      setGeneralError(t('sell.waitForPhotos'));
      return;
    }
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setGeneralError(t('sell.errors.checkFields'));
      return;
    }

    const input: ListingInput = {
      title: title.trim(),
      description: description.trim(),
      category: category!,
      size: size.trim(),
      brand: brand.trim(),
      condition: condition!,
      price_dzd: Number(price),
      wilaya: wilaya!,
    };
    const details = JSON.stringify(input);
    const toRemove = [...removedIds];
    const toUpload = photos.filter((p) => p.remoteId === undefined);
    // The order must be sent when editing, or when retrying after some photos went up.
    const sendOrder = photos.length > 1 && (isEdit || photos.some((p) => p.remoteId !== undefined));
    const total = 1 + toRemove.length + toUpload.length + (sendOrder ? 1 : 0);
    let done = 0;
    const step = (label: string) => setProgress({ done, total, label });

    try {
      // 1. The listing's details.
      step(t('sell.progress.details'));
      let id = listingId.current;
      if (id === null) {
        id = (await createListing(input)).id;
        listingId.current = id;
        savedDetails.current = details;
      } else if (savedDetails.current !== details) {
        await updateListing(id, input);
        savedDetails.current = details;
      }
      done++;

      // 2. Photos the user removed.
      for (const photoId of toRemove) {
        step(t('sell.progress.removing'));
        await deleteListingPhoto(id, photoId);
        setRemovedIds((ids) => ids.filter((x) => x !== photoId));
        done++;
      }

      // 3. New photos, one by one.
      let current = photos;
      for (const [index, photo] of toUpload.entries()) {
        step(t('sell.progress.photo', { current: index + 1, total: toUpload.length }));
        const uploaded = await uploadListingPhoto(id, photo.uri);
        current = current.map((p) => (p.key === photo.key ? { ...p, remoteId: uploaded.id } : p));
        setPhotos(current);
        done++;
      }

      // 4. The order (the first photo is the cover).
      if (sendOrder) {
        step(t('sell.progress.order'));
        const ordered = await orderListingPhotos(id, current.map((p) => p.remoteId!));
        current = current.map((p, i) => ({ ...p, remoteId: ordered[i]?.id ?? p.remoteId }));
        setPhotos(current);
        done++;
      }

      setProgress({ done: total, total, label: t('sell.progress.done') });
      onDone(id);
    } catch (error) {
      // Keep everything; "Try again" continues from where it stopped.
      const result = formErrorsFrom(error, t, FIELD_MAP);
      setErrors((current) => ({ ...current, ...result.fields }));
      setGeneralError(result.general ?? t('sell.errors.checkFields'));
      setFailedOnce(true);
    } finally {
      setProgress(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <PhotoStrip
          photos={photos}
          onRemove={removePhoto}
          onMakeCover={makeCover}
          onAdd={(source) => pick(source, MAX_PHOTOS - photos.length)}
          error={errors.photos}
          disabled={busy}
        />

        <FormField
          label={t('sell.title')}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            clearError('title');
          }}
          placeholder={t('sell.titlePlaceholder')}
          maxLength={100}
          error={errors.title}
          editable={!busy}
        />

        <FormField
          label={t('sell.description')}
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            clearError('description');
          }}
          placeholder={t('sell.descriptionPlaceholder')}
          multiline
          maxLength={2000}
          error={errors.description}
          editable={!busy}
        />

        <Choices
          label={t('sell.category')}
          error={errors.category}
          options={mainCategories.map((c) => ({ value: c.id, label: categoryName(c, language) }))}
          selected={mainId}
          onSelect={(value) => {
            setCategory(value);
            clearError('category');
          }}
          disabled={busy}
        />
        {subCategories.length > 0 && (
          <Choices
            label={t('sell.subCategory')}
            options={subCategories.map((c) => ({ value: c.id, label: categoryName(c, language) }))}
            selected={selected?.parent ? selected.id : null}
            onSelect={setCategory}
            disabled={busy}
          />
        )}

        <View style={styles.row}>
          <View style={styles.flex}>
            <FormField
              label={t('sell.size')}
              value={size}
              onChangeText={(value) => {
                setSize(value);
                clearError('size');
              }}
              placeholder={t('search.sizePlaceholder')}
              maxLength={20}
              error={errors.size}
              editable={!busy}
            />
          </View>
          <View style={styles.flex}>
            <FormField
              label={t('sell.brand')}
              value={brand}
              onChangeText={(value) => {
                setBrand(value);
                clearError('brand');
              }}
              placeholder={t('sell.brandPlaceholder')}
              maxLength={50}
              error={errors.brand}
              editable={!busy}
            />
          </View>
        </View>

        <Choices
          label={t('sell.condition')}
          error={errors.condition}
          options={CONDITIONS.map((c) => ({ value: c, label: t(`listing.conditions.${c}`) }))}
          selected={condition}
          onSelect={(value) => {
            setCondition(value);
            clearError('condition');
          }}
          disabled={busy}
        />

        <FormField
          label={t('sell.price')}
          value={price}
          onChangeText={(value) => {
            setPrice(onlyDigits(value).slice(0, 9));
            clearError('price');
          }}
          placeholder="2500"
          keyboardType="number-pad"
          inputMode="numeric"
          hint={t('sell.priceHint')}
          error={errors.price}
          editable={!busy}
        />

        <WilayaPicker
          label={t('sell.wilaya')}
          value={wilaya}
          onChange={(code) => {
            setWilaya(code);
            clearError('wilaya');
          }}
          error={errors.wilaya}
        />

        {progress ? (
          <View style={styles.progress} accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}>
            <ThemedText type="small" themeColor="textSecondary" style={align}>
              {progress.label}
            </ThemedText>
            <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
              <View
                style={[
                  styles.bar,
                  { width: `${Math.max(5, (progress.done / progress.total) * 100)}%` },
                ]}
              />
            </View>
          </View>
        ) : null}

        {generalError ? (
          <ThemedText type="small" style={[styles.error, align]} accessibilityLiveRegion="polite">
            {generalError}
          </ThemedText>
        ) : null}

        <PrimaryButton
          title={
            failedOnce ? t('sell.tryAgain') : isEdit ? t('sell.saveChanges') : t('sell.publish')
          }
          onPress={publish}
          loading={busy}
        />
      </ScrollView>
      {dialogs}
    </KeyboardAvoidingView>
  );
}

/** A row of choice buttons (category, condition). */
function Choices<T extends string | number>({
  label,
  options,
  selected,
  onSelect,
  error,
  disabled,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
  error?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.chips}>
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => onSelect(option.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              style={[
                styles.chip,
                { backgroundColor: isSelected ? Brand.fill : theme.backgroundElement },
                error && !isSelected ? styles.chipError : null,
              ]}>
              <ThemedText type="smallBold" style={isSelected ? styles.chipTextSelected : undefined}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <ThemedText type="small" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingBottom: Spacing.five,
  },
  row: { flexDirection: 'row', gap: Spacing.three },
  choices: { gap: Spacing.two, alignSelf: 'stretch' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipError: { borderColor: '#D93025' },
  chipTextSelected: { color: '#ffffff' },
  progress: { gap: Spacing.one },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4, backgroundColor: Brand.fill },
  error: { color: '#D93025' },
});
