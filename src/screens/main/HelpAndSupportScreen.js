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
import Logo from '../../components/Logo1';

const HelpAndSupportScreen = ({ navigation }) => {
  const [expandedSection, setExpandedSection] = useState(null);

  const faqs = [
    {
      question: "How do I create a streaming room?",
      answer: "To create a streaming room, go to the Home tab and tap the '+' button. Fill in the room details and tap 'Create Room' to start streaming."
    },
    {
      question: "How do I add friends?",
      answer: "You can add friends by going to the Friends tab and using the search feature to find users. Send them a friend request, and once accepted, they'll appear in your friends list."
    },
    {
      question: "What are the system requirements?",
      answer: "For the best streaming experience, we recommend: \n• Stable internet connection (5Mbps or higher)\n• iOS 11+ or Android 8+\n• Sufficient device storage space"
    },
    {
      question: "How can I improve stream quality?",
      answer: "To improve stream quality:\n• Ensure strong internet connection\n• Close unnecessary background apps\n• Use Wi-Fi instead of cellular data when possible\n• Adjust video quality settings in the stream"
    }
  ];

  const toggleSection = (index) => {
    setExpandedSection(expandedSection === index ? null : index);
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@yourapp.com');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleContactSupport}
          >
            <MaterialIcons name="email" size={24} color="#007AFF" />
            <Text style={styles.actionButtonText}>Contact Support</Text>
            <MaterialIcons name="chevron-right" size={24} color="#666666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Linking.openURL('https://yourapp.com/documentation')}
          >
            <MaterialIcons name="library-books" size={24} color="#007AFF" />
            <Text style={styles.actionButtonText}>Documentation</Text>
            <MaterialIcons name="chevron-right" size={24} color="#666666" />
          </TouchableOpacity>
        </View>

        {/* FAQs Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {faqs.map((faq, index) => (
            <TouchableOpacity
              key={index}
              style={styles.faqItem}
              onPress={() => toggleSection(index)}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <MaterialIcons
                  name={expandedSection === index ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                  size={24}
                  color="#666666"
                />
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
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <TouchableOpacity
            style={styles.infoItem}
            onPress={() => Linking.openURL('https://yourapp.com/terms')}
          >
            <Text style={styles.infoLabel}>Terms of Service</Text>
            <MaterialIcons name="chevron-right" size={24} color="#666666" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.infoItem}
            onPress={() => Linking.openURL('https://yourapp.com/privacy')}
          >
            <Text style={styles.infoLabel}>Privacy Policy</Text>
            <MaterialIcons name="chevron-right" size={24} color="#666666" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 16,
  },
  faqItem: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  faqAnswer: {
    fontSize: 14,
    color: '#888888',
    marginTop: 12,
    lineHeight: 20,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  infoLabel: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  infoValue: {
    fontSize: 16,
    color: '#666666',
  },
});

export default HelpAndSupportScreen; 