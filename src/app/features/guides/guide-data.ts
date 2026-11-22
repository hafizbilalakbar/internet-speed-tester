export interface Guide {
  slug: string; title: string; category: string; description: string; readMinutes: number;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'internet-speed-guide', title: 'Internet speed test guide', category: 'Fundamentals', readMinutes: 7,
    description: 'Learn what download, upload, latency, jitter and loss mean, and how to run a speed test you can trust.',
    sections: [
      { heading: 'What a speed test actually measures', paragraphs: ['A speed test transfers real data between your device and a test server, then calculates throughput from the number of bytes transferred and the time taken. Netvelox counts bytes at the browser level and uses no-cache endpoints so cached content cannot inflate the result.', 'Throughput is usually expressed in megabits per second (Mbps). Eight megabits make one megabyte. A 100 Mbps connection can theoretically transfer about 12.5 megabytes per second before overhead.'] },
      { heading: 'The five metrics that matter', paragraphs: ['Download speed determines how quickly data arrives. Upload speed controls how quickly you send data. Latency is the round-trip time of a small request. Jitter is the variation in latency. Probe loss measures how many application-layer probes fail.', 'A connection with high download speed but high latency and jitter can still feel poor for calls and gaming. This is why Netvelox shows all five metrics together.'] },
      { heading: 'How to get a representative result', paragraphs: ['Connect to the network you want to test, disable large background transfers where practical, and run at least three tests at different times. Results vary with congestion, Wi-Fi conditions and server load.', 'Use the same test server when comparing before-and-after changes, such as moving a router or changing a plan.'], bullets: ['Test over both Wi-Fi and Ethernet if possible.', 'Stand within a few metres of the router for a baseline.', 'Record the server and time of day with each result.'] },
    ],
  },
  {
    slug: 'understanding-jitter', title: 'Understanding jitter', category: 'Latency', readMinutes: 5,
    description: 'What jitter is, how it is calculated and why it matters for voice calls, gaming and streaming.',
    sections: [
      { heading: 'Definition', paragraphs: ['Jitter is the variation in delay between packets arriving over a network. If one round trip takes 20 ms and the next takes 60 ms, the connection has 40 ms of variation for that pair of samples.', 'Netvelox reports the mean absolute difference between consecutive measured round-trip times. This is an application-layer measurement using sequenced requests to our endpoint, not a packet-level ICMP measurement.'] },
      { heading: 'Why it matters', paragraphs: ['Voice and video calls use small, time-sensitive packets. When jitter is high, receiving buffers must grow to avoid gaps, which adds delay. The result is choppy audio or out-of-order video even when bandwidth looks sufficient.', 'Competitive gaming is similarly sensitive: variable latency makes movement feel inconsistent and can cause rubber-banding.'], bullets: ['Below 10 ms is typically excellent.', '10–20 ms is usually acceptable for calls.', 'Above 30 ms may cause noticeable problems.'] },
      { heading: 'Reducing jitter', paragraphs: ['Use wired Ethernet for fixed devices, move closer to the router, switch to a less congested 5 GHz channel, and avoid large uploads during calls. If jitter remains high even on Ethernet, the issue may be ISP congestion or peering.'] },
    ],
  },
  {
    slug: 'internet-troubleshooting', title: 'Internet troubleshooting guide', category: 'Troubleshooting', readMinutes: 8,
    description: 'A structured approach to diagnosing slow internet, unstable Wi-Fi and high latency.',
    sections: [
      { heading: 'Start with a baseline', paragraphs: ['Run a full Netvelox test and save the result. Then repeat it on a different device and, if possible, over Ethernet. If all devices show the same problem, the issue is likely upstream of your device; if only one device is affected, look at that device first.'] },
      { heading: 'Separate Wi-Fi from the internet connection', paragraphs: ['Test near the router and then in the problem area. A large drop in throughput or a rise in jitter away from the router points to wireless coverage or interference rather than your ISP.', 'Browsers cannot see Wi-Fi signal strength or a router\'s connected-device list. Netvelox never claims to know these values; the optional local companion agent can read OS neighbour information with explicit permission.'], bullets: ['Check that the router firmware is current.', 'Keep the router elevated and away from metal and thick walls.', 'Try a different Wi-Fi channel if the neighbourhood is congested.'] },
      { heading: 'Check loaded latency', paragraphs: ['If idle latency is low but latency jumps during downloads, bufferbloat is likely. QoS settings on the router or a different access point can help manage the queue.', 'If HTTP probe loss appears in tests, check cabling and wireless stability before contacting your provider with the result ID.'] },
    ],
  },
  {
    slug: 'isp-information', title: 'ISP information and what it tells you', category: 'Network basics', readMinutes: 6,
    description: 'How public IP intelligence identifies an ISP and ASN, and what those fields can and cannot prove.',
    sections: [
      { heading: 'What ISP lookup provides', paragraphs: ['When you run a test, the server receives your public IP address. Netvelox queries an external IP intelligence service to infer the network operator, autonomous system number, organisation and approximate location.', 'These values are external inferences, not measurements of your route. ISP names can be stale or generic, especially when traffic uses a VPN or a cloud provider.'] },
      { heading: 'ASN and routing', paragraphs: ['An Autonomous System Number identifies a network that exchanges routing information with other networks. Two IP addresses in the same city can have very different latency if they travel through different AS paths.', 'The selected test server and its provider are shown with every result so you can interpret the numbers in context.'] },
      { heading: 'Privacy', paragraphs: ['Your IP and ISP can be hidden from public result links. Precise location is only collected after you explicitly grant browser permission and is removed from shared results unless you enable location sharing.'] },
    ],
  },
  {
    slug: 'global-speed-statistics', title: 'How global speed statistics are built', category: 'Analytics', readMinutes: 5,
    description: 'Why Netvelox publishes sample sizes, reporting periods and methodology with every aggregate statistic.',
    sections: [
      { heading: 'Only real samples', paragraphs: ['Aggregate figures come exclusively from completed tests stored by Netvelox. We do not import third-party datasets or generate placeholder rankings.', 'Small samples are misleading. Country, city and ISP comparisons require at least 50 completed tests in the reporting period before they appear.'] },
      { heading: 'Reporting period and methodology', paragraphs: ['Each statistic includes its reporting window, sample count, methodology and last-updated timestamp. Averages are simple means of completed measurements; outliers are retained because real networks have outliers.', 'Regional coverage depends on deployed test nodes. A single node cannot represent worldwide performance, so the server list shows exactly which regions are available.'] },
    ],
  },
  {
    slug: 'understanding-ping', title: 'Understanding ping and loaded latency', category: 'Latency', readMinutes: 6,
    description: 'The difference between idle latency, loaded latency and bufferbloat.',
    sections: [
      { heading: 'Idle latency', paragraphs: ['Idle latency is the round-trip time when the connection is mostly unused. It reflects physical distance, routing and the processing delay of each hop.', 'Netvelox reports the average as the headline ping value and also stores minimum, maximum and median values.'] },
      { heading: 'Loaded latency', paragraphs: ['Loaded latency is measured while a download or upload is running. If queues in your router grow, loaded latency rises sharply — a condition known as bufferbloat.', 'A large gap between idle and loaded latency explains why a connection can feel laggy while a large file is downloading.'] },
      { heading: 'Interpreting the comparison', paragraphs: ['Netvelox shows idle, download-loaded and upload-loaded latency side by side and flags a likely bufferbloat condition when loaded latency more than doubles under traffic.'] },
    ],
  },
  {
    slug: 'download-vs-upload', title: 'Download vs upload speed', category: 'Fundamentals', readMinutes: 4,
    description: 'Why the two directions differ and which one your activity needs.',
    sections: [
      { heading: 'Asymmetric connections', paragraphs: ['Most consumer broadband connections are asymmetric: download capacity is higher than upload capacity. This reflects typical usage such as watching video and loading websites.', 'Fibre-to-the-home connections can be closer to symmetric, but the actual result still depends on the plan and equipment.'] },
      { heading: 'Which direction matters', paragraphs: ['Streaming and browsing mostly need download speed. Video calls, cloud backups, large file uploads and remote work tools need reliable upload speed.', 'Netvelox measures both directions separately and scores suitability for each activity from the actual measurements.'] },
    ],
  },
  {
    slug: 'wifi-optimization', title: 'Wi-Fi optimisation basics', category: 'Troubleshooting', readMinutes: 7,
    description: 'Practical steps to improve wireless throughput and stability, verified with repeatable tests.',
    sections: [
      { heading: 'Placement and bands', paragraphs: ['Place the router near the centre of the home, elevated and away from thick walls, metal objects and appliances. Test 2.4 GHz for range and 5 GHz for speed at short distances.', 'Use the same test server before and after each change so the comparison is meaningful.'] },
      { heading: 'Interference and channels', paragraphs: ['Neighbouring networks and household devices can interfere, especially on 2.4 GHz. If available, select a less congested channel or let the router choose automatically and re-test.', 'Jitter is often a better indicator of interference than peak speed: watch the jitter figure in the full result.'] },
      { heading: 'Verify with measurements', paragraphs: ['After each change, run at least three full tests and compare download speed, jitter and loaded latency. Keep the result IDs so you can review the exact conditions later.'] },
    ],
  },
];
