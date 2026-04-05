/**
 * HMS LEVIATHAN — Crew Avatar Creator Screen
 * ===========================================
 * File: mobile/components/AvatarCreator.tsx
 *
 * Usage — add to your lobby flow or profile screen:
 *   import { AvatarCreator } from '@/components/AvatarCreator';
 *
 * Or as a standalone screen in app/avatar.tsx:
 *   import AvatarCreatorScreen from '@/components/AvatarCreator';
 *   export default AvatarCreatorScreen;
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Image, ActivityIndicator, Alert, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useGame, RoleKey, ROLE_NAMES } from '@/contexts/GameContext';

// ─── types ───────────────────────────────────────────────────

interface AvatarData {
  hairColor: string;
  skinTone: string;
  eyeColor: string;
  ageGroup: string;
  distinctiveFeature: string;
  crewDescription: string;
  traits: string[];
  catchphrase: string;
  // Added by the component
  name: string;
  role: string;
  roleColor: string;
}

interface Props {
  /** Called when the user accepts their avatar */
  onComplete?: (avatar: AvatarData, photoUri: string) => void;
  /** Called when the user wants to skip */
  onSkip?: () => void;
}

// ─── role config (matches existing app roles) ─────────────────

const ROLES: { key: RoleKey; label: string; color: string }[] = [
  { key: 'c', label: 'Captain',   color: Colors.amber },
  { key: 'n', label: 'Navigator', color: Colors.blue  },
  { key: 's', label: 'Sonar',     color: Colors.teal  },
  { key: 'e', label: 'Engineer',  color: Colors.teal  },
  { key: 'w', label: 'Weapons',   color: '#ff6600'    },
];

// ─── API call ─────────────────────────────────────────────────

async function generateAvatarFromServer(
  photoUri: string,
  crewName: string,
  role: string,
  domain: string
): Promise<AvatarData> {
  // Read photo as base64
  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Detect media type from URI
  const mediaType = photoUri.toLowerCase().endsWith('.png')
    ? 'image/png'
    : 'image/jpeg';

  const url = `https://${domain}/api/generate-avatar`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoBase64: base64,
      mediaType,
      crewName: crewName.trim().toUpperCase(),
      role,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error ${response.status}: ${text.slice(0, 120)}`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Avatar generation failed');

  return data.avatar;
}

// ─── component ───────────────────────────────────────────────

export default function AvatarCreator({ onComplete, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  const { myName, myRole } = useGame();
  const domain = process.env.EXPO_PUBLIC_DOMAIN || 'localhost:80';

  const [crewName, setCrewName]     = useState(myName || '');
  const [selectedRole, setRole]     = useState<RoleKey>(myRole || 'c');
  const [photoUri, setPhotoUri]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [avatar, setAvatar]         = useState<AvatarData | null>(null);
  const loadingTimer                = useRef<ReturnType<typeof setInterval> | null>(null);

  const roleConfig = ROLES.find(r => r.key === selectedRole) || ROLES[0];

  // ── photo picker ────────────────────────────────────────────

  async function pickPhoto(useCamera: boolean) {
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to take your crew photo.');
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,       // keep file size manageable for API
            base64: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
            base64: false,
          });

      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        setAvatar(null); // reset if re-taking photo
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open camera/library. Please try again.');
    }
  }

  // ── generate ────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (!photoUri || !crewName.trim()) return;

    setLoading(true);
    setAvatar(null);

    const msgs = [
      'Analyzing crew member...',
      'Reading your features...',
      'Designing uniform...',
      'Building your profile...',
      'Almost ready...',
    ];
    let msgIdx = 0;
    setLoadingMsg(msgs[0]);
    loadingTimer.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % msgs.length;
      setLoadingMsg(msgs[msgIdx]);
    }, 2000);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const avatarData = await generateAvatarFromServer(
        photoUri,
        crewName,
        roleConfig.label,
        domain
      );

      const fullAvatar: AvatarData = {
        ...avatarData,
        name: crewName.trim().toUpperCase(),
        role: roleConfig.label,
        roleColor: roleConfig.color,
      };

      clearInterval(loadingTimer.current!);
      setAvatar(fullAvatar);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    } catch (err: any) {
      clearInterval(loadingTimer.current!);
      Alert.alert(
        'Generation Failed',
        err.message || 'Could not generate avatar. Check your connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }, [photoUri, crewName, roleConfig, domain]);

  // ── accept ──────────────────────────────────────────────────

  function handleAccept() {
    if (!avatar || !photoUri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onComplete?.(avatar, photoUri);
  }

  const canGenerate = !!photoUri && crewName.trim().length > 0 && !loading;
  const rc = roleConfig.color;

  // ─────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={[styles.root, { paddingTop: insets.top + 8 }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>CREW AVATAR</Text>
          <Text style={styles.subtitle}>HMS LEVIATHAN · THE ODYSSEY</Text>
        </View>
        {onSkip && (
          <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>SKIP</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Step 1 — Name */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>STEP 1 — YOUR CREW NAME</Text>
        <TextInput
          style={[styles.input, { color: rc, borderColor: rc + '55' }]}
          value={crewName}
          onChangeText={setCrewName}
          placeholder="ENTER YOUR NAME"
          placeholderTextColor={Colors.textDim}
          maxLength={20}
          autoCapitalize="words"
          returnKeyType="done"
        />
      </View>

      {/* Step 2 — Role */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>STEP 2 — YOUR STATION</Text>
        <View style={styles.roleRow}>
          {ROLES.map(r => {
            const sel = r.key === selectedRole;
            return (
              <TouchableOpacity
                key={r.key}
                style={[
                  styles.roleBtn,
                  { borderColor: sel ? r.color : Colors.border },
                  sel && { backgroundColor: r.color + '18' },
                ]}
                onPress={() => { setRole(r.key); Haptics.selectionAsync(); setAvatar(null); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.roleBtnText, { color: sel ? r.color : Colors.textDim }]}>
                  {r.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Step 3 — Photo */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>STEP 3 — YOUR CREW PHOTO</Text>

        {/* Preview */}
        <View style={styles.photoPreviewWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>NO PHOTO YET</Text>
            </View>
          )}
        </View>

        {/* Buttons */}
        <View style={styles.photoButtons}>
          <TouchableOpacity
            style={[styles.photoBtn, { borderColor: rc, backgroundColor: rc + '15' }]}
            onPress={() => pickPhoto(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.photoBtnText, { color: rc }]}>📷  TAKE PHOTO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoBtn, { borderColor: Colors.border }]}
            onPress={() => pickPhoto(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.photoBtnText, { color: Colors.textDim }]}>🖼  UPLOAD</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.photoNote}>
          Photo is analyzed by AI to build your cartoon profile. It is not stored on any server.
        </Text>
      </View>

      {/* Generate button */}
      <TouchableOpacity
        style={[
          styles.generateBtn,
          { borderColor: canGenerate ? rc : Colors.border },
          canGenerate && { backgroundColor: rc + '12' },
          !canGenerate && { opacity: 0.4 },
        ]}
        onPress={generate}
        disabled={!canGenerate}
        activeOpacity={0.8}
      >
        <Text style={[styles.generateBtnText, { color: canGenerate ? rc : Colors.textDim }]}>
          ⚡  GENERATE CREW AVATAR
        </Text>
      </TouchableOpacity>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={Colors.teal} />
          <Text style={styles.loadingText}>{loadingMsg}</Text>
          <Text style={styles.loadingSubText}>Claude AI is analyzing your photo</Text>
        </View>
      )}

      {/* Result */}
      {avatar && !loading && (
        <View style={[styles.card, styles.resultCard, { borderColor: rc + '55' }]}>

          {/* Card header */}
          <View style={[styles.resultHeader, { backgroundColor: rc + '12' }]}>
            <Text style={[styles.resultRole, { color: rc }]}>{avatar.role.toUpperCase()}</Text>
            <Text style={styles.resultShip}>HMS LEVIATHAN</Text>
          </View>

          {/* Photo + overlay */}
          <View style={styles.resultPortrait}>
            <Image source={{ uri: photoUri! }} style={styles.resultPhoto} />
            {/* Role color overlay */}
            <View style={[styles.portraitOverlay, { backgroundColor: rc + '18' }]} />
            {/* Name plate */}
            <View style={[styles.namePlate, { backgroundColor: rc + '22', borderTopColor: rc + '44' }]}>
              <Text style={[styles.namePlateText, { color: rc }]}>{avatar.name}</Text>
              <Text style={styles.namePlateSub}>{avatar.role.toUpperCase()} · HMS LEVIATHAN</Text>
            </View>
          </View>

          {/* Details */}
          <View style={styles.resultDetails}>
            <Text style={styles.resultDesc}>{avatar.crewDescription}</Text>

            <View style={styles.traitsRow}>
              {avatar.traits.map(t => (
                <View key={t} style={[styles.traitPill, { backgroundColor: rc + '15', borderColor: rc + '30' }]}>
                  <Text style={[styles.traitText, { color: rc }]}>{t}</Text>
                </View>
              ))}
            </View>

            {avatar.catchphrase ? (
              <Text style={[styles.catchphrase, { borderLeftColor: rc + '40' }]}>
                "{avatar.catchphrase}"
              </Text>
            ) : null}
          </View>

          {/* Action buttons */}
          <View style={styles.resultActions}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: Colors.green, backgroundColor: Colors.green + '12' }]}
              onPress={handleAccept}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionBtnText, { color: Colors.green }]}>✓  USE THIS AVATAR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: rc, backgroundColor: rc + '08' }]}
              onPress={() => { setAvatar(null); setPhotoUri(null); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionBtnText, { color: rc }]}>↻  START OVER</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 20,
    color: Colors.amber,
    letterSpacing: 3,
  },
  subtitle: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 2,
    marginTop: 2,
  },
  skipBtn: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 2,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  cardLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 7,
    borderWidth: 1,
    padding: 12,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 18,
    letterSpacing: 2,
    textAlign: 'center',
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    minWidth: 80,
    alignItems: 'center',
  },
  roleBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 8,
    letterSpacing: 1.5,
  },
  photoPreviewWrap: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    letterSpacing: 1,
    textAlign: 'center',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  photoBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
  photoNote: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    textAlign: 'center',
    lineHeight: 14,
  },
  generateBtn: {
    padding: 18,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  generateBtnText: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 14,
    letterSpacing: 2,
  },
  loadingCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 10,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    color: Colors.teal,
    letterSpacing: 2,
    textAlign: 'center',
  },
  loadingSubText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    letterSpacing: 1,
  },
  resultCard: {
    padding: 0,
    overflow: 'hidden',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultRole: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    letterSpacing: 2,
  },
  resultShip: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 1,
  },
  resultPortrait: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    backgroundColor: '#020810',
  },
  resultPhoto: {
    width: '100%',
    height: '100%',
  },
  portraitOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  namePlate: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    borderTopWidth: 1,
    alignItems: 'center',
    gap: 3,
  },
  namePlateText: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 16,
    letterSpacing: 2,
  },
  namePlateSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 1,
  },
  resultDetails: {
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  resultDesc: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  traitsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  traitPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  traitText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    letterSpacing: 1,
  },
  catchphrase: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 11,
    color: Colors.textDim,
    fontStyle: 'italic',
    borderLeftWidth: 2,
    paddingLeft: 8,
    lineHeight: 17,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    letterSpacing: 1.5,
  },
});
