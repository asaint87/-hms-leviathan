import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { ActionLogEntry } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';

const KIND_COLORS: Record<ActionLogEntry['kind'], string> = {
  info: Colors.textDim,
  kill: Colors.green,
  warn: Colors.amber,
  crit: Colors.red,
};

interface Props {
  entries: ActionLogEntry[];
}

export function ActionLog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No log entries</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      scrollEnabled={entries.length > 5}
      renderItem={({ item }) => {
        const c = KIND_COLORS[item.kind];
        const time = new Date(item.timestamp);
        const hh = String(time.getHours()).padStart(2, '0');
        const mm = String(time.getMinutes()).padStart(2, '0');
        const ss = String(time.getSeconds()).padStart(2, '0');
        return (
          <View style={styles.entry}>
            <Text style={styles.timestamp}>{hh}:{mm}:{ss}</Text>
            <View style={[styles.kindDot, { backgroundColor: c }]} />
            <Text style={[styles.text, { color: c }]}>{item.text}</Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    letterSpacing: 1,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  timestamp: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim + '60',
    letterSpacing: 0.5,
    marginTop: 1,
    width: 52,
  },
  kindDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 3,
  },
  text: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    flex: 1,
    lineHeight: 14,
    letterSpacing: 0.5,
  },
});
