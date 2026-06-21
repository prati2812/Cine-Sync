import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  SafeAreaView,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import colors from '../../../theme/Colors';

const HelpAndSupportScreen = ({ navigation }) => {
  const [expandedSection, setExpandedSection] = useState(null);

  const faqs = [
    {
      question: 'How do I create a streaming room?',
      answer:
        "To create a streaming room, go to the Home tab and tap the '+' button. Fill in the room details and tap 'Create Room' to start streaming.",
    },
    {
      question: 'How do I add friends?',
      answer:
        "You can add friends by going to the Friends tab and using the search feature to find users. Send them a friend request, and once accepted, they'll appear in your friends list.",
    },
    {
      question: 'What are the system requirements?',
      answer:
        'For the best streaming experience, we recommend: \n• Stable internet connection (5Mbps or higher)\n• iOS 11+ or Android 8+\n• Sufficient device storage space',
    },
    {
      question: 'How can I improve stream quality?',
      answer:
        'To improve stream quality:\n• Ensure strong internet connection\n• Close unnecessary background apps\n• Use Wi-Fi instead of cellular data when possible\n• Adjust video quality settings in the stream',
    },
  ];

  const toggleSection = index => {
    setExpandedSection(expandedSection === index ? null : index);
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@yourapp.com');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}>
          <MaterialIcons
            name="arrow-back-ios"
            size={18}
            color={colors.TITLE_COLOR}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="help-buoy" size={18} color={colors.FILM_GOLD} />
          <Text style={styles.headerTitle}>Help & Support</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleContactSupport}
            activeOpacity={0.8}>
            <View
              style={[
                styles.actionIconWrap,
                { backgroundColor: colors.GRADIENT_START + '18' },
              ]}>
              <MaterialIcons
                name="email"
                size={20}
                color={colors.GRADIENT_START}
              />
            </View>
            <Text style={styles.actionButtonText}>Contact Support</Text>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={colors.MUTED_COLOR}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              Linking.openURL('https://yourapp.com/documentation')
            }
            activeOpacity={0.8}>
            <View
              style={[
                styles.actionIconWrap,
                { backgroundColor: colors.PURPLE_ACCENT + '18' },
              ]}>
              <MaterialIcons
                name="library-books"
                size={20}
                color={colors.PURPLE_ACCENT}
              />
            </View>
            <Text style={styles.actionButtonText}>Documentation</Text>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={colors.MUTED_COLOR}
            />
          </TouchableOpacity>
        </View>

        {/* FAQs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {faqs.map((faq, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.faqItem,
                expandedSection === index && styles.faqItemExpanded,
              ]}
              onPress={() => toggleSection(index)}
              activeOpacity={0.8}>
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <View style={styles.faqChevron}>
                  <MaterialIcons
                    name={
                      expandedSection === index
                        ? 'keyboard-arrow-up'
                        : 'keyboard-arrow-down'
                    }
                    size={22}
                    color={
                      expandedSection === index
                        ? colors.PRIMARY_COLOR
                        : colors.MUTED_COLOR
                    }
                  />
                </View>
              </View>
              {expandedSection === index && (
                <Text style={styles.faqAnswer}>{faq.answer}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Information</Text>
          <View style={styles.infoCard}>
            <View style={[styles.infoItem, styles.infoItemBorder]}>
              <View style={styles.infoLeft}>
                <View
                  style={[
                    styles.actionIconWrap,
                    { backgroundColor: colors.CYAN_ACCENT + '18' },
                  ]}>
                  <MaterialIcons
                    name="info-outline"
                    size={18}
                    color={colors.CYAN_ACCENT}
                  />
                </View>
                <Text style={styles.infoLabel}>Version</Text>
              </View>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>

            <TouchableOpacity
              style={[styles.infoItem, styles.infoItemBorder]}
              onPress={() => Linking.openURL('https://yourapp.com/terms')}
              activeOpacity={0.7}>
              <View style={styles.infoLeft}>
                <View
                  style={[
                    styles.actionIconWrap,
                    { backgroundColor: colors.FILM_GOLD + '18' },
                  ]}>
                  <MaterialIcons
                    name="description"
                    size={18}
                    color={colors.FILM_GOLD}
                  />
                </View>
                <Text style={styles.infoLabel}>Terms of Service</Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={22}
                color={colors.MUTED_COLOR}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.infoItem}
              onPress={() => Linking.openURL('https://yourapp.com/privacy')}
              activeOpacity={0.7}>
              <View style={styles.infoLeft}>
                <View
                  style={[
                    styles.actionIconWrap,
                    { backgroundColor: colors.ACCEPT_GREEN + '18' },
                  ]}>
                  <MaterialIcons
                    name="privacy-tip"
                    size={18}
                    color={colors.ACCEPT_GREEN}
                  />
                </View>
                <Text style={styles.infoLabel}>Privacy Policy</Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={22}
                color={colors.MUTED_COLOR}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },

  content: {
    flex: 1,
    padding: 16,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.PRIMARY_COLOR,
    marginBottom: 10,
    paddingHorizontal: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Action Buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 15,
    color: colors.TITLE_COLOR,
    fontWeight: '500',
  },

  // FAQ
  faqItem: {
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  faqItemExpanded: {
    borderColor: colors.PRIMARY_COLOR + '40',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    color: colors.TITLE_COLOR,
    fontWeight: '600',
    paddingRight: 10,
  },
  faqChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.SUB_TITLE_COLOR,
    marginTop: 12,
    lineHeight: 21,
  },

  // Info Card
  infoCard: {
    backgroundColor: colors.CARD_COLOR,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  infoItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 15,
    color: colors.TITLE_COLOR,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: colors.MUTED_COLOR,
    fontWeight: '500',
  },
});

export default HelpAndSupportScreen;