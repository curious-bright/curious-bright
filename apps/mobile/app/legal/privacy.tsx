import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={styles.paragraph}>{children}</Text>
);

const Li: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.listItem}>
    <Text style={styles.bullet}>›</Text>
    <Text style={styles.listText}>{children}</Text>
  </View>
);

const InlineLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <Text style={styles.link} onPress={() => Linking.openURL(href)}>
    {children}
  </Text>
);

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <>
      <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>PRIVACY POLICY</Text>
          </View>
          <Text style={styles.heroTitle}>Your Privacy, Protected</Text>
          <Text style={styles.heroSubtitle}>
            We collect only what we need, we never sell your data, and you stay in full control.
          </Text>
          <Text style={styles.meta}>Last updated: August 4, 2026</Text>
        </View>

        <Section title="1. What We Collect">
          <P>We collect the minimum information necessary to run the platform:</P>
          <Li>Account data — your name, email, school name, and hashed password.</Li>
          <Li>Submitted content — manuscripts and documents you upload.</Li>
          <Li>Room & message activity — messages sent in Study Rooms.</Li>
          <Li>Usage metadata — request logs for security monitoring.</Li>
          <P>We do NOT use third-party analytics trackers or advertising cookies.</P>
        </Section>

        <Section title="2. How We Use Your Data">
          <Li>Authenticate your account and keep your session secure.</Li>
          <Li>Display your profile alongside your published submissions.</Li>
          <Li>Route messages within Study Rooms you have joined.</Li>
          <Li>Send push notifications about your submission status.</Li>
          <Li>Detect and prevent abuse (spam, brute-force, malicious uploads).</Li>
          <P>We never use your data to train AI models or sell insights to advertisers.</P>
        </Section>

        <Section title="3. Data Storage & Security">
          <Li>Passwords are hashed using bcrypt. Plaintext passwords are never stored.</Li>
          <Li>Auth tokens are short-lived JWTs stored securely on your device.</Li>
          <Li>Files are stored in Cloudflare R2, encrypted at rest and in transit.</Li>
          <Li>Rate limiting is applied to all API endpoints to block abuse.</Li>
          <P>
            Security issues?{' '}
            <InlineLink href="mailto:security@curiousbright.com.ng">
              security@curiousbright.com.ng
            </InlineLink>
          </P>
        </Section>

        <Section title="4. Data Retention & Deletion">
          <Li>Account data is retained until you request deletion.</Li>
          <Li>Server logs are retained for up to 90 days for security purposes.</Li>
          <P>
            To delete your account, email{' '}
            <InlineLink href="mailto:privacy@curiousbright.com.ng">
              privacy@curiousbright.com.ng
            </InlineLink>
            . We process requests within 30 days.
          </P>
        </Section>

        <Section title="5. Contact Us">
          <Li>
            Privacy:{' '}
            <InlineLink href="mailto:privacy@curiousbright.com.ng">
              privacy@curiousbright.com.ng
            </InlineLink>
          </Li>
          <Li>
            Security:{' '}
            <InlineLink href="mailto:security@curiousbright.com.ng">
              security@curiousbright.com.ng
            </InlineLink>
          </Li>
          <Li>
            Website:{' '}
            <InlineLink href="https://curiousbright.com.ng">
              curiousbright.com.ng
            </InlineLink>
          </Li>
        </Section>

        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>
            We may update this Privacy Policy from time to time. Continued use of Curious Bright after changes constitutes acceptance.
          </Text>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Go Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F6F2',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  hero: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2DFC9',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,90,54,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,54,0.25)',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#FF5A36',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#14141A',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#6B685C',
    lineHeight: 22,
    marginBottom: 8,
  },
  meta: {
    fontSize: 11,
    color: '#6B685C',
    fontFamily: 'monospace',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2DFC9',
    borderRadius: 6,
    marginBottom: 14,
    overflow: 'hidden',
  },
  sectionHeader: {
    backgroundColor: '#F7F6F2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2DFC9',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14141A',
    letterSpacing: -0.2,
  },
  sectionBody: {
    padding: 16,
    gap: 8,
  },
  paragraph: {
    fontSize: 13,
    color: '#6B685C',
    lineHeight: 20,
    marginBottom: 4,
  },
  listItem: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  bullet: {
    fontSize: 14,
    color: '#FF5A36',
    marginTop: 1,
  },
  listText: {
    flex: 1,
    fontSize: 13,
    color: '#6B685C',
    lineHeight: 20,
  },
  link: {
    color: '#00A896',
    textDecorationLine: 'underline',
  },
  footerNote: {
    borderWidth: 1,
    borderColor: '#C8C4B0',
    borderStyle: 'dashed',
    borderRadius: 4,
    padding: 14,
    backgroundColor: '#F7F6F2',
    marginBottom: 20,
  },
  footerNoteText: {
    fontSize: 11,
    color: '#6B685C',
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#14141A',
    borderRadius: 6,
  },
  backBtnText: {
    color: '#F7F6F2',
    fontSize: 14,
    fontWeight: '600',
  },
});
