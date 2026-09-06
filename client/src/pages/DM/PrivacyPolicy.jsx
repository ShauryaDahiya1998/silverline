// Settings > Legal > Data privacy — full Swiss DSG / GDPR privacy policy
// text supplied by Remar. Read-only, no logic beyond page layout; mirrors
// the app's existing card/prose styling (see DeviceSettings.jsx, Support
// pages) rather than a modal, since it's long enough to want its own
// scrollable page.
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Privacy Policy</h1>
          <p className="text-xs text-gray-400 mb-5">Data protection information for the Remar app and website</p>

          <div className="text-sm text-gray-600 space-y-4 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700">Remar</p>
              <p>Motorenstrasse 6, 8623 Wetzikon, Switzerland</p>
              <p>Email: info@remar.ch</p>
            </div>

            <div>
              <p><span className="font-semibold text-gray-700">Authorized representative:</span> Paulo Oliveira</p>
              <p><span className="font-semibold text-gray-700">Company name:</span> Remar</p>
              <p><span className="font-semibold text-gray-700">Data Protection Officer:</span> Paulo Oliveira</p>
              <p>0763297770 · poliveira@remar.ch</p>
            </div>

            <Section title="General Information / Introduction">
              <p>Based on Article 13 of the Swiss Federal Constitution and the federal data protection regulations (Data Protection Act, DSG), every person has the right to privacy and protection against the misuse of their personal data. The operators of this website take the protection of your personal data very seriously. We treat your personal data confidentially and in accordance with the statutory data protection regulations and this privacy policy.</p>
              <p>In cooperation with our hosting providers, we strive to protect the databases as effectively as possible against unauthorized access, loss, misuse or falsification.</p>
              <p>Please note that data transmission over the internet (e.g., when communicating via email) can have security vulnerabilities. Complete protection of data against access by third parties is not possible.</p>
              <p>By using this website, you consent to the collection, processing, and use of data as described below. This website can generally be visited without registration. Data such as pages viewed or names of files accessed, date, and time are stored on the server for statistical purposes, without this data being directly linked to you personally. Where personal data (e.g., name, address, or email addresses) is collected on our site, this is always done on a voluntary basis, where possible. This data will not be shared with third parties without your explicit consent.</p>
            </Section>

            <Section title="Processing of personal data">
              <p>Personal data is any information relating to an identified or identifiable natural person. A data subject is a person whose personal data is processed. Processing includes any handling of personal data, regardless of the means and procedures used, in particular the storage, disclosure, collection, erasure, retention, alteration, destruction, and use of personal data.</p>
              <p>We process personal data in accordance with Swiss data protection law. Where and to the extent that the EU GDPR is applicable, we also process personal data on the following legal bases in conjunction with Article 6(1) GDPR:</p>
              <p>a) Processing of personal data with the consent of the data subject;<br />
              b) Processing of personal data for the performance of a contract with the data subject and for taking steps prior to entering into a contract;<br />
              c) Processing of personal data for compliance with a legal obligation to which we are subject under applicable EU law or the applicable law of a country in which the GDPR is wholly or partially applicable;<br />
              d) Processing of personal data to protect the vital interests of the data subject or of another natural person;<br />
              f) Processing of personal data for the purposes of our legitimate interests or those of third parties, except where such interests are overridden by the fundamental rights and freedoms of the data subject. These legitimate interests include, in particular, our business interest in being able to provide our website, information security, the enforcement of our own legal claims, and compliance with Swiss law.</p>
              <p>We process personal data for the duration necessary for the respective purpose(s). Where longer retention periods are required due to legal or other obligations to which we are subject, we restrict processing accordingly.</p>
            </Section>

            <Section title="Cookies">
              <p>This website uses cookies. These are small text files that allow us to store specific, user-related information on the user's device while they are using the website. Cookies make it possible, in particular, to determine the frequency of use and the number of users of the pages, to analyze user behavior patterns, and also to make our website more user-friendly. Cookies remain stored beyond the end of a browser session and can be retrieved when the website is visited again. If you do not wish this, you should configure your internet browser to refuse the acceptance of cookies.</p>
              <p>You can generally object to the use of cookies for online marketing purposes for many services, especially tracking, via the US website aboutads.info/choices or the EU website youronlinechoices.com. Furthermore, you can prevent cookies from being stored by disabling them in your browser settings. Please note that in this case, you may not be able to use all the features of this website.</p>
            </Section>

            <Section title="SSL/TLS encryption">
              <p>This website uses SSL/TLS encryption for security reasons and to protect the transmission of confidential content, such as requests that you send to us as the website operator. You can recognize an encrypted connection by the fact that the browser's address bar changes from "http://" to "https://" and by the padlock symbol in your browser's address bar.</p>
              <p>When SSL or TLS encryption is enabled, the data you send to us cannot be read by third parties.</p>
            </Section>

            <Section title="Server log files">
              <p>The provider of this website automatically collects and stores information in so-called server log files, which your browser automatically transmits to us. This information includes: browser type and version, operating system used, referrer URL, hostname of the accessing computer, and time of the server request.</p>
              <p>This data cannot be linked to specific individuals. This data will not be combined with other data sources. We reserve the right to review this data subsequently if we become aware of concrete indications of unlawful use.</p>
            </Section>

            <Section title="Third-party services">
              <p>This website may use Google Maps to embed maps, Google Invisible reCAPTCHA to protect against bots and spam, and YouTube to embed videos.</p>
              <p>These services from the American company Google LLC use cookies, among other things, which transfer data to Google in the USA. We assume that no personal tracking takes place in this context simply by using our website. Google has committed to ensuring adequate data protection in accordance with the US-EU and US-Swiss Privacy Shield frameworks. For more information, please see Google's privacy policy.</p>
            </Section>

            <Section title="Contact Form">
              <p>If you send us inquiries via the contact form, your information from the inquiry form, including the contact details you provided, will be stored by us for processing the inquiry and in case of follow-up questions. We will not share this data without your consent.</p>
            </Section>

            <Section title="Newsletter">
              <p>If you wish to receive the newsletter offered on the website, we require your email address and information that allows us to verify that you are the owner of the email address provided and that you agree to receive the newsletter. No further data is collected. We use this data exclusively for sending the requested information and do not share it with third parties.</p>
              <p>After you have given your consent to the storage of your data, your email address, and its use for sending the newsletter, you can revoke this consent at any time, for example, via the "unsubscribe link" in the newsletter.</p>
            </Section>

            <Section title="Comment function">
              <p>For the comment function on this website, in addition to your comment, information about the time of creation of the comment, your e-mail address and, if you do not post anonymously, your chosen username will be stored.</p>
            </Section>

            <Section title="Storing IP addresses">
              <p>Our comment function stores the IP addresses of users who submit comments. Since we do not review comments on our site before they are published, we need this data to be able to take action against the author in the event of legal violations such as insults or propaganda.</p>
            </Section>

            <Section title="Subscribing to comments">
              <p>As a user of this site, you can subscribe to comments after registering. You will receive a confirmation email to verify that you are the owner of the email address provided. You can unsubscribe from this feature at any time via a link in the notification emails.</p>
            </Section>

            <Section title="Rights of the data subject">
              <p className="font-semibold text-gray-700">Right to confirmation</p>
              <p>Every data subject has the right to request confirmation from the website operator as to whether personal data concerning him or her is being processed. If you wish to exercise this right of confirmation, you can contact the data protection officer at any time.</p>

              <p className="font-semibold text-gray-700 mt-3">Right of access</p>
              <p>Every data subject whose personal data is being processed has the right to obtain from the operator of this website, at any time and free of charge, information about the data stored concerning them and a copy of this information. Furthermore, information may be provided regarding the following: the purposes of the processing; the categories of personal data being processed; the recipients to whom the personal data have been or will be disclosed; where possible, the envisaged period for which the personal data will be stored, or, if not possible, the criteria used to determine that period; the existence of the right to request rectification or erasure or restriction of processing, or to object to such processing; the right to lodge a complaint with a supervisory authority; where the personal data are not collected from the data subject, any available information as to their source.</p>
              <p>In addition, the data subject has the right to be informed whether personal data are transferred to a third country or international organization, and of the appropriate safeguards relating to any such transfer.</p>
              <p>If you wish to exercise this right to information, you can contact our data protection officer at any time.</p>

              <p className="font-semibold text-gray-700 mt-3">Right to rectification</p>
              <p>Every data subject has the right to request the immediate rectification of inaccurate personal data concerning him or her, and to have incomplete personal data completed, including by means of a supplementary statement.</p>

              <p className="font-semibold text-gray-700 mt-3">Right to erasure (right to be forgotten)</p>
              <p>Every data subject has the right to request erasure of their personal data where, among other grounds: the data are no longer necessary for the purposes collected; consent is withdrawn and there is no other legal basis; the data subject objects to the processing (including direct marketing); the data were unlawfully processed; erasure is required for legal compliance; or the data were collected in relation to information society services offered directly to a child. The data protection officer will ensure any erasure request is complied with immediately.</p>

              <p className="font-semibold text-gray-700 mt-3">Right to restriction of processing</p>
              <p>Every data subject has the right to request restriction of processing where: the accuracy of the data is contested (for the period needed to verify it); the processing is unlawful and the data subject requests restriction instead of erasure; the controller no longer needs the data but the data subject needs it for legal claims; or an objection to processing is pending review.</p>

              <p className="font-semibold text-gray-700 mt-3">Right to data portability</p>
              <p>Every data subject has the right to receive their personal data in a structured, commonly used, machine-readable format, and to have it transmitted directly to another controller where technically feasible.</p>

              <p className="font-semibold text-gray-700 mt-3">Right to object</p>
              <p>Every data subject has the right to object, on grounds relating to their particular situation, to the processing of their personal data at any time. Following an objection, we will no longer process the data unless we can demonstrate compelling legitimate grounds that override your interests, rights and freedoms, or the processing serves to establish, exercise or defend legal claims.</p>

              <p className="font-semibold text-gray-700 mt-3">Right to withdraw consent</p>
              <p>Every person whose personal data is being processed has the right to withdraw their consent to that processing at any time.</p>

              <p className="mt-3">To exercise any of the rights above, you can contact our data protection officer at any time (see contact details above).</p>
            </Section>

            <Section title="Objection to Email Marketing">
              <p>The use of contact details published within the scope of the legal notice for sending unsolicited advertising and informational materials is hereby prohibited. We expressly reserve the right to take legal action in the event of unsolicited advertising, such as spam emails.</p>
            </Section>

            <Section title="Paid Services">
              <p>To provide paid services, we request additional data, such as payment information, in order to process your order. We store this data in our systems until the statutory retention periods have expired.</p>
            </Section>

            <Section title="Copyrights">
              <p>The copyright and all other rights to the content, images, photos, or other files on this website belong exclusively to the operator of this website or the named copyright holders. Prior written consent from the copyright holders is required for the reproduction of any files. Anyone who commits copyright infringement without consent may be liable to prosecution and, under certain circumstances, may be liable for damages.</p>
            </Section>

            <Section title="Disclaimer">
              <p>All information on our website has been carefully checked. We strive to ensure that the information we provide is up-to-date, correct, and complete. However, errors cannot be entirely ruled out, and therefore we cannot guarantee the completeness, accuracy, and timeliness of the information, including journalistic and editorial content. Liability claims relating to material or immaterial damages caused by the use or non-use of the information provided, or by the use of incorrect or incomplete information, are generally excluded.</p>
              <p>The publisher may change or delete texts at its sole discretion and without prior notice and is not obligated to update the content of this website. Use of or access to this website is at the visitor's own risk. The publisher, its clients, or partners are not responsible for damages allegedly caused by visiting this website and therefore assume no liability for such damages.</p>
              <p>The publisher also assumes no responsibility or liability for the content and availability of third-party websites accessible via external links from this website. The operators of the linked sites are solely responsible for their content. The publisher expressly distances itself from all external content that may be criminally or civilly liable or that violates common decency.</p>
            </Section>

            <Section title="Data Transfer to the USA">
              <p>Our website uses tools from companies based in the USA. When these tools are active, your personal data may be transferred to the US servers of the respective companies. The USA is not considered a safe third country under EU data protection law. US companies are obligated to disclose personal data to security authorities without you, as the data subject, having any legal recourse. Therefore, it cannot be ruled out that US authorities (e.g., intelligence agencies) may process, analyze, and permanently store your data located on US servers for surveillance purposes. We have no control over these processing operations.</p>
            </Section>

            <Section title="Changes">
              <p>We may change this privacy policy at any time without prior notice. The current version published on our website applies. If the privacy policy is part of an agreement with you, we will inform you of any updates by email or other suitable means.</p>
            </Section>

            <Section title="General Disclaimer">
              <p>The author assumes no liability for the correctness, accuracy, timeliness, reliability, or completeness of the information provided.</p>
              <p>Liability claims against the author for damages of a material or immaterial nature arising from access to or use or non-use of the published information, from misuse of the connection, or from technical malfunctions are excluded.</p>
              <p>All offers are subject to change without notice. The author expressly reserves the right to change, supplement, or delete parts of the pages or the entire offer without prior notice, or to temporarily or permanently discontinue publication.</p>
            </Section>

            <Section title="Using WhatsApp Business">
              <p>We offer you the option of contacting us via the WhatsApp Business messaging service. The provider is Meta Platforms Ireland Ltd., 4 Grand Canal Square, Grand Canal Harbour, Dublin 2, Ireland.</p>
              <p>When you click the WhatsApp button in our chatbot or on our website, you will be redirected directly to WhatsApp. Personal data such as your phone number, message content, and communication metadata (e.g., time, frequency of use) will be transmitted to and processed by WhatsApp. Data transfer to the USA cannot be ruled out.</p>
              <p>The use of WhatsApp is based on your explicit consent in accordance with Article 6 Paragraph 1 Letter a GDPR. By clicking the button, you expressly agree to this transfer and processing.</p>
              <p>Please note that we have no control over further data processing by WhatsApp/Meta. For more information, please see WhatsApp's privacy policy (whatsapp.com/legal/privacy-policy).</p>
              <p>You can withdraw your consent at any time for the future. An informal notification to us is sufficient. Data processing carried out before the withdrawal remains lawful.</p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

// A titled block of paragraphs — keeps the long policy scannable without
// resorting to a bulleted list (Zubin's spacing/shading-over-borders
// preference extends here: divider comes from vertical spacing, not a rule).
const Section = ({ title, children }) => (
  <div>
    <h2 className="text-sm font-bold remar-green mb-1.5">{title}</h2>
    <div className="space-y-2">{children}</div>
  </div>
);
