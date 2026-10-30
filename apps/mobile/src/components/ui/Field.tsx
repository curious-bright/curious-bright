// Notebook form field: mono caption label, GeneralSans input on a hairline
// rule that turns coral on focus.

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { fontSize, spacing, useTheme } from '../../theme';

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
}

export function Field({ label, hint, error, style, ...inputProps }: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.fadedInk }]}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.fadedInk}
        style={[
          styles.input,
          {
            color: colors.ink,
            borderBottomColor: error ? colors.danger : focused ? colors.coral : colors.line,
            backgroundColor: colors.paperCard,
          },
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
      />
      {error ? (
        <Text style={[styles.helper, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.helper, { color: colors.fadedInk }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  label: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  input: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.body,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderRadius: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 11,
  },
  helper: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
});
