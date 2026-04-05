import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  StatusBar,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useGame, RoleKey, ROLE_NAMES } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { useThemeMusic } from '@/hooks/useThemeMusic';

const ROLES: { key: RoleKey; icon: string; desc: string }[] = [
  { key: 'c', icon: 'shield-star', desc: 'Command the crew' },
  { key: 'n', icon: 'compass', desc: 'Steer & navigate' },
  { key: 's', icon: 'radar', desc: 'Find the enemy' },
  { key: 'e', icon: 'cog', desc: 'Keep systems alive' },
  { key: 'w', icon: 'target', desc: 'Lock on & fire' },
];

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return 'http://localhost:3000';
}

export default function LobbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    connected,
    myName,
    myRole,
    myAvatar,
    setMyName,
    setMyRole,
    setMyAvatar,
    createRoom,
    joinRoom,
    roomCode,
    error,
    clearError,
  } = useGame();

  const { stop } = useThemeMusic();
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [rawSelfieBase64, setRawSelfieBase64] = useState<string | null>(null);
  const params = useLocalSearchParams<{ join?: string }>();

  const qrJoinCode = params.join?.toUpperCase() ?? '';

  const handleJoinFromQR = () => {
    if (!myName.trim()) {
      Alert.alert('Crew name needed', 'Enter your name above before boarding.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    joinRoom(qrJoinCode);
  };

  const pickAvatar = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Camera needed', 'Allow camera access to take your crew photo.');
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

      if (!result.canceled && result.assets[0]) {
        // Keep a higher-res version for AI generation
        const forAI = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 512, height: 512 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        // Thumbnail for display/transmission
        const thumb = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 80, height: 80 } }],
          { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (thumb.base64) {
          setMyAvatar(`data:image/jpeg;base64,${thumb.base64}`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        if (forAI.base64) {
          setRawSelfieBase64(forAI.base64);
        }
      }
    } catch {
    }
  };

  const generateCartoonAvatar = async () => {
    if (!rawSelfieBase64) return;
    setGeneratingAvatar(true);
    try {
      const resp = await fetch(`${getApiBase()}/api/generate-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoBase64: rawSelfieBase64,
          mediaType: 'image/jpeg',
        }),
      });
      const json = await resp.json();
      if (json.success && json.imageBase64) {
        // Resize the AI image down for transmission
        const uri = `data:image/png;base64,${json.imageBase64}`;
        const resized = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 128, height: 128 } }],
          { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (resized.base64) {
          setMyAvatar(`data:image/jpeg;base64,${resized.base64}`);
        }
        setRawSelfieBase64(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Generation Failed', json.error || 'Could not generate portrait. Try again.');
      }
    } catch (e: any) {
      Alert.alert('Connection Error', 'Could not reach the server. Check your connection.');
    } finally {
      setGeneratingAvatar(false);
    }
  };

  const showAvatarOptions = () => {
    if (Platform.OS === 'web') {
      pickAvatar(false);
      return;
    }
    Alert.alert('Crew Photo', 'Choose your source', [
      { text: 'Take Selfie', onPress: () => pickAvatar(true) },
      { text: 'Choose Photo', onPress: () => pickAvatar(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const rc = Colors.roles[myRole];

  const handleCreateRoom = () => {
    if (!myName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createRoom();
  };

  const handleJoinRoom = () => {
    if (!myName.trim() || joinCode.trim().length < 4) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    joinRoom(joinCode);
    setJoinModalVisible(false);
    setJoinCode('');
  };

  React.useEffect(() => {
    if (roomCode) {
      stop(true).then(() => router.replace('/waiting'));
    }
  }, [roomCode]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 20 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <View style={styles.connectionDot}>
        <View style={[styles.dot, { backgroundColor: connected ? Colors.green : '#555' }]} />
        <Text style={styles.connLabel}>{connected ? 'CONNECTED' : 'CONNECTING...'}</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.subTitle}>THE ODYSSEY</Text>
        <Text style={styles.title}>HMS{'\n'}LEVIATHAN</Text>
        <Text style={styles.subtitle2}>FAMILY SUBMARINE COMMAND</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>YOUR CREW NAME</Text>
        <View style={styles.nameRow}>
          <TouchableOpacity
            style={[styles.avatarBtn, { borderColor: rc.primary + '88' }]}
            onPress={showAvatarOptions}
            activeOpacity={0.8}
          >
            {myAvatar ? (
              <Image source={{ uri: myAvatar }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="camera" size={22} color={rc.primary} />
                <Text style={[styles.avatarHint, { color: rc.primary }]}>PHOTO</Text>
              </View>
            )}
          </TouchableOpacity>
          <TextInput
            style={[styles.input, styles.inputFlex, { color: rc.primary, borderColor: rc.primary + '55' }]}
            value={myName}
            onChangeText={setMyName}
            placeholder="ENTER YOUR NAME"
            placeholderTextColor={Colors.textDim}
            maxLength={20}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </View>
        {rawSelfieBase64 && myAvatar && (
          <TouchableOpacity
            style={[styles.cartoonBtn, { borderColor: rc.primary, backgroundColor: rc.bg }, generatingAvatar && styles.disabled]}
            onPress={generateCartoonAvatar}
            disabled={generatingAvatar}
            activeOpacity={0.8}
          >
            {generatingAvatar ? (
              <Text style={[styles.cartoonBtnText, { color: rc.primary }]}>
                GENERATING PORTRAIT...
              </Text>
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color={rc.primary} />
                <Text style={[styles.cartoonBtnText, { color: rc.primary }]}>
                  GENERATE CREW PORTRAIT
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>YOUR STATION</Text>
        <View style={styles.roleGrid}>
          {ROLES.map((r) => {
            const sel = r.key === myRole;
            const col = Colors.roles[r.key];
            return (
              <TouchableOpacity
                key={r.key}
                style={[
                  styles.roleBtn,
                  { borderColor: sel ? col.primary : 'rgba(255,255,255,0.08)' },
                  sel && { backgroundColor: col.bg },
                ]}
                onPress={() => {
                  setMyRole(r.key);
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.75}
              >
                <MaterialCommunityIcons
                  name={r.icon as any}
                  size={22}
                  color={sel ? col.primary : Colors.textDim}
                />
                <Text style={[styles.roleName, { color: sel ? col.primary : Colors.textDim }]}>
                  {ROLE_NAMES[r.key].toUpperCase()}
                </Text>
                <Text style={styles.roleDesc}>{r.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
        </TouchableOpacity>
      )}

      {qrJoinCode ? (
        <View style={styles.inviteBanner}>
          <Text style={styles.inviteLabel}>ROOM INVITE</Text>
          <Text style={styles.inviteCode}>{qrJoinCode}</Text>
          <Text style={styles.inviteHint}>Enter your name &amp; station above, then board</Text>
          <TouchableOpacity
            style={[styles.boardBtn, !myName.trim() && styles.disabled]}
            onPress={handleJoinFromQR}
            disabled={!myName.trim() || !connected}
            activeOpacity={0.85}
          >
            <Text style={styles.boardBtnText}>⚓  BOARD SHIP</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.createBtn,
            { borderColor: rc.primary, backgroundColor: rc.bg },
            !myName.trim() && styles.disabled,
          ]}
          onPress={handleCreateRoom}
          disabled={!myName.trim() || !connected}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={20} color={rc.primary} />
          <Text style={[styles.actionBtnText, { color: rc.primary }]}>CREATE ROOM</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.joinBtn,
            !myName.trim() && styles.disabled,
          ]}
          onPress={() => {
            setJoinModalVisible(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          disabled={!myName.trim() || !connected}
          activeOpacity={0.8}
        >
          <Ionicons name="enter-outline" size={20} color={Colors.text} />
          <Text style={[styles.actionBtnText, { color: Colors.text }]}>JOIN ROOM</Text>
        </TouchableOpacity>
      </View>
      )}

      <Text style={styles.hint}>
        The Captain creates the room. Crew members join with the room code.
      </Text>

      <Modal
        visible={joinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>JOIN ROOM</Text>
            <Text style={styles.modalSub}>
              {params.join
                ? 'QR code scanned — enter your name above and board!'
                : "Enter the 4-character code from the Captain's screen"}
            </Text>
            <TextInput
              style={styles.codeInput}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="ABCD"
              placeholderTextColor={Colors.textDim}
              maxLength={4}
              autoCapitalize="characters"
              keyboardType="default"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setJoinModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  joinCode.length < 4 && styles.disabled,
                ]}
                onPress={handleJoinRoom}
                disabled={joinCode.length < 4}
              >
                <Text style={styles.modalConfirmText}>BOARD SHIP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 60,
    alignItems: 'center',
  },
  connectionDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connLabel: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  subTitle: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.amber + '80',
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 42,
    color: Colors.amber,
    textAlign: 'center',
    lineHeight: 46,
    textShadowColor: 'rgba(255,179,0,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    letterSpacing: 4,
  },
  subtitle2: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 3,
    marginTop: 10,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  cardLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 3,
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexShrink: 0,
  },
  avatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  avatarHint: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 6,
    letterSpacing: 1,
  },
  cartoonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderRadius: 8,
  },
  cartoonBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    letterSpacing: 2,
  },
  inputFlex: {
    flex: 1,
  },
  input: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    letterSpacing: 2,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  roleName: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
  roleDesc: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  createBtn: {},
  joinBtn: {
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  actionBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    letterSpacing: 2,
  },
  disabled: {
    opacity: 0.3,
  },
  inviteBanner: {
    width: '100%',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.teal + '55',
    backgroundColor: 'rgba(0,224,255,0.05)',
    marginBottom: 16,
    gap: 6,
  },
  inviteLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    color: Colors.teal,
    letterSpacing: 4,
  },
  inviteCode: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 40,
    color: Colors.teal,
    letterSpacing: 10,
  },
  inviteHint: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 1,
    textAlign: 'center',
  },
  boardBtn: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: Colors.teal,
    alignItems: 'center',
  },
  boardBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 14,
    color: '#000',
    letterSpacing: 2,
  },
  hint: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 16,
  },
  errorBanner: {
    width: '100%',
    backgroundColor: 'rgba(255,48,48,0.15)',
    borderWidth: 1,
    borderColor: Colors.red,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 11,
    color: Colors.red,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,8,16,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 20,
    color: Colors.amber,
    letterSpacing: 4,
    marginBottom: 8,
  },
  modalSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
    lineHeight: 16,
  },
  codeInput: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 32,
    color: Colors.amber,
    borderWidth: 2,
    borderColor: Colors.border2,
    borderRadius: 10,
    padding: 16,
    width: '100%',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    letterSpacing: 8,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    letterSpacing: 2,
  },
  modalConfirm: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(255,179,0,0.12)',
    borderWidth: 1,
    borderColor: Colors.amber,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    color: Colors.amber,
    letterSpacing: 2,
  },
});
