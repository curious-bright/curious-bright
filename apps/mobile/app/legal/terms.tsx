import React from 'react';
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

export default function TermsOfUseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <>
      <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>TERMS OF USE</Text>
          </View>
          <Text style={styles.heroTitle}>Rules of the Notebook</Text>
          <Text style={styles.heroSubtitle}>
            By using Curious Bright, you agree to these Terms. Contact us if anything is unclear before using the platform.
          </Text>
          <Text style={styles.meta}>Last updated: August 4, 2026</Text>
        </View>

        <Section title="1. Who Can Use Curious Bright">
          <P>By registering, you confirm that:</P>
          <Li>You are at least 13 years old (or 16 in the EEA).</Li>
          <Li>If under 18, you have parental or guardian consent.</Li>
          <Li>You will provide accurate registration information.</Li>
          <Li>You are responsible for maintaining the security of your credentials.</Li>
        </Section>

        <Section title="2. Content You Submit">
          <P>When you upload content, you confirm that:</P>
          <Li>You are the original author or have the necessary rights to submit it.</Li>
          <Li>It does not infringe any copyright, patent, or trademark.</Li>
          <Li>It is not defamatory, fraudulent, obscene, or otherwise unlawful.</Li>
          <P>
            Approved submissions are published under{' '}
            <InlineLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</InlineLink>
            {' '}— freely reusable with attribution. You retain full ownership of your IP.
          </P>
        </Section>

        <Section title="3. Community & Study Rooms">
          <P>By participating in Study Rooms, you agree to:</P>
          <Li>Treat all participants with respect — harassment is not tolerated.</Li>
          <Li>Not share another user's private information without their consent.</Li>
          <Li>Not use Study Rooms to coordinate academic dishonesty.</Li>
          <Li>Not flood rooms with spam or automated messages.</Li>
          <Li>Not impersonate other users, educators, or Curious Bright staff.</Li>
        </Section>

        <Section title="4. Prohibited Uses">
          <P>You agree NOT to:</P>
          <Li>Transmit malware, viruses, or any malicious code.</Li>
          <Li>Circumvent rate limiting, authentication, or access controls.</Li>
          <Li>Scrape or harvest user data in bulk without written consent.</Li>
          <Li>Upload copyrighted textbooks or materials obtained illegally.</Li>
          <Li>Create multiple accounts to evade a ban or bypass limits.</Li>
        </Section>

        <Section title="5. Moderation & Enforcement">
          <Li>We may reject, unpublish, or remove content that violates these Terms.</Li>
          <Li>Accounts may be suspended or permanently banned for serious violations.</Li>
          <Li>
            Moderator decisions can be appealed at{' '}
            <InlineLink href="mailto:moderation@curiousbright.com.ng">
              moderation@curiousbright.com.ng
            </InlineLink>
          </Li>
        </Section>

        <Section title="6. Disclaimer & Liability">
          <P>
            Curious Bright is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free service.
          </P>
          <P>
            Our total liability for any direct claim shall not exceed the amount you paid for the platform in the prior 12 months (which for free users is $0).
          </P>
        </Section>

        <Section title="7. Governing Law">
          <P>
            These Terms are governed by the laws of the Federal Republic of Nigeria. Disputes shall be resolved through good-faith negotiation first, and thereafter through Nigerian courts.
          </P>
        </Section>

        <Section title="8. Contact Us">
          <Li>
            General:{' '}
            <InlineLink href="mailto:hello@curiousbright.com.ng">
              hello@curiousbright.com.ng
            </InlineLink>
          </Li>
          <Li>
            Legal:{' '}
            <InlineLink href="mailto:legal@curiousbright.com.ng">
              legal@curiousbright.com.ng
            </InlineLink>
          </Li>
        </Section>

        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>
            By accessing any part of Curious Bright, you acknowledge you have read and understood these Terms of Use.
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
