import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  type ParcelSize,
} from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { mainCategoriesInOrder } from '@/components/category-chips';
import { ParcelSizePicker } from '@/components/parcel-size-picker';
import { OptionsMenu } from '@/components/options-menu';
import { MAX_PHOTOS, PhotoStrip, type FormPhoto } from '@/components/photo-strip';
import { WilayaPicker } from '@/components/wilaya-picker';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { preparePhoto } from '@/photos/prepare';
import { usePhotoPicker } from '@/photos/use-photo-picker';
import { useTokens } from '@/theme';
import { AppText, Button, Card, ChoiceSheet, ListGroup, ListRow, SectionHeader, TextField } from '@/ui';
import { onlyDigits } from '@/utils/digits';

/** Quick picks in the Size and Brand sheets (anything else can be typed). */
const SIZE_SUGGESTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '38', '40', '42', '44', '46'];
const BRAND_SUGGESTIONS = ['Zara', 'H&M', 'Mango', 'Bershka', 'LC Waikiki', 'DeFacto', 'Nike', 'Adidas', 'Puma', 'Samsung', 'Apple', 'Xiaomi'];

type Sheet = 'category' | 'size' | 'brand' | 'condition';

type Field =
  | 'photos' | 'title' | 'description' | 'category' | 'size' | 'brand' | 'condition' | 'price' | 'wilaya'
  | 'parcelSize';
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
  parcel_size: 'parcelSize',
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
    parcel_size: listing.parcel_size,
  };
}

/** The Sell form, also used to edit a listing. */
export function ListingForm({ initial, onDone }: Props) {
  const { t } = useTranslation();
  const tk = useTokens();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { user } = useAuth();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
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
  // A new listing: the seller must choose (so they think about it).
  const [parcelSize, setParcelSize] = useState<ParcelSize | ''>(initial?.parcel_size ?? '');

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
    if (!parcelSize) found.parcelSize = t('sell.errors.parcelSizeRequired');
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
      parcel_size: parcelSize as ParcelSize,
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

  const selectedLabel = selected ? categoryName(selected, language) : '';
  const fieldError = (field: Field) =>
    errors[field] ? (
      <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
        {errors[field]}
      </AppText>
    ) : null;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: tk.color.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: tk.space.lg, gap: tk.space.xl, maxWidth: 640 }]}
        keyboardShouldPersistTaps="handled">
        {/* Photos */}
        <View style={{ gap: tk.space.sm }}>
          <SectionHeader title={t('sell.photos')} />
          <PhotoStrip
            photos={photos}
            onRemove={removePhoto}
            onMakeCover={makeCover}
            onAdd={() => setPhotoMenu(true)}
            error={errors.photos}
            disabled={busy}
          />
        </View>

        {/* About your item */}
        <View style={{ gap: tk.space.md }}>
          <SectionHeader title={t('sell.aboutItem')} />
          <TextField
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
          <TextField
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
        </View>

        {/* Item details: rows that open pickers */}
        <View style={{ gap: tk.space.sm }}>
          <SectionHeader title={t('sell.itemDetails')} />
          <ListGroup>
            <ListRow designIcon="list" tint="tint1" label={t('sell.category')} value={selectedLabel || t('sell.choose')} onPress={() => setSheet('category')} />
            <ListRow designIcon="shirt" tint="tint2" label={t('sell.size')} value={size || t('sell.optional')} onPress={() => setSheet('size')} />
            <ListRow designIcon="handbag" tint="tint3" label={t('sell.brand')} value={brand || t('sell.optional')} onPress={() => setSheet('brand')} />
            <ListRow
              designIcon="shield"
              tint="tint4"
              label={t('sell.condition')}
              value={condition ? t(`listing.conditions.${condition}`) : t('sell.choose')}
              onPress={() => setSheet('condition')}
            />
          </ListGroup>
          {fieldError('category')}
          {fieldError('condition')}
        </View>

        {/* Pricing */}
        <View style={{ gap: tk.space.md }}>
          <SectionHeader title={t('sell.pricing')} />
          <TextField
            label={t('sell.price')}
            icon="cash-outline"
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
        </View>

        {/* Delivery: every item is delivered; the seller gives the parcel size */}
        <ParcelSizePicker
          value={parcelSize}
          disabled={busy}
          error={errors.parcelSize}
          onChange={(size) => {
            setParcelSize(size);
            clearError('parcelSize');
          }}
        />

        {/* Location */}
        <View style={{ gap: tk.space.sm }}>
          <SectionHeader title={t('sell.location')} />
          <WilayaPicker
            variant="row"
            label={t('sell.wilaya')}
            value={wilaya}
            onChange={(code) => {
              setWilaya(code);
              clearError('wilaya');
            }}
            error={errors.wilaya}
          />
        </View>
      </ScrollView>

      {/* Fixed at the bottom: progress, error and Publish. */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: tk.color.background,
            borderTopColor: tk.color.border,
            paddingHorizontal: tk.space.lg,
            paddingTop: tk.space.md,
            paddingBottom: insets.bottom + tk.space.md,
            gap: tk.space.sm,
          },
        ]}>
        <View style={[styles.bottomInner, { gap: tk.space.sm }]}>
          {progress ? (
            <View
              style={{ gap: tk.space.xs }}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}>
              <AppText variant="small" tone="secondary">
                {progress.label}
              </AppText>
              <View style={[styles.track, { backgroundColor: tk.color.surfaceAlt }]}>
                <View
                  style={[
                    styles.bar,
                    { backgroundColor: tk.color.primary, width: `${Math.max(5, (progress.done / progress.total) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          ) : null}
          {generalError ? (
            <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
              {generalError}
            </AppText>
          ) : null}
          <Button
            title={failedOnce ? t('sell.tryAgain') : isEdit ? t('sell.saveChanges') : t('sell.publish')}
            onPress={publish}
            loading={busy}
          />
        </View>
      </View>

      {/* Pickers */}
      <OptionsMenu
        visible={photoMenu}
        onClose={() => setPhotoMenu(false)}
        options={[
          { label: t('sell.camera'), icon: 'camera-outline', onPress: () => pick('camera', MAX_PHOTOS - photos.length) },
          { label: t('sell.gallery'), icon: 'images-outline', onPress: () => pick('gallery', MAX_PHOTOS - photos.length) },
        ]}
      />
      <ChoiceSheet
        visible={sheet === 'category'}
        title={t('sell.category')}
        groups={[
          { options: mainCategories.map((c) => ({ value: c.id, label: categoryName(c, language) })) },
          ...(subCategories.length
            ? [{ title: t('sell.subCategory'), options: subCategories.map((c) => ({ value: c.id, label: categoryName(c, language) })) }]
            : []),
        ]}
        selected={category}
        onSelect={(value) => {
          setCategory(value);
          clearError('category');
          // A main category with sub-categories: stay open to choose one (optional).
          const hasSubs = categories.some((c) => c.parent === value);
          if (!hasSubs) setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet<string>
        visible={sheet === 'size'}
        title={t('sell.size')}
        selected={null}
        onSelect={() => {}}
        suggestions={SIZE_SUGGESTIONS}
        freeText={{
          value: size,
          placeholder: t('search.sizePlaceholder'),
          maxLength: 20,
          onSubmit: (value) => {
            setSize(value);
            clearError('size');
            setSheet(null);
          },
        }}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet<string>
        visible={sheet === 'brand'}
        title={t('sell.brand')}
        selected={null}
        onSelect={() => {}}
        suggestions={BRAND_SUGGESTIONS}
        freeText={{
          value: brand,
          placeholder: t('sell.brandPlaceholder'),
          maxLength: 50,
          onSubmit: (value) => {
            setBrand(value);
            clearError('brand');
            setSheet(null);
          },
        }}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet<Condition>
        visible={sheet === 'condition'}
        title={t('sell.condition')}
        groups={[{ options: CONDITIONS.map((c) => ({ value: c, label: t(`listing.conditions.${c}`) })) }]}
        selected={condition}
        onSelect={(value) => {
          setCondition(value);
          clearError('condition');
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      {dialogs}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { width: '100%', alignSelf: 'center', paddingBottom: 32 },
  bottomBar: { borderTopWidth: StyleSheet.hairlineWidth },
  bottomInner: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
});
