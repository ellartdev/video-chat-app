import './style.css';
import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCRlGNvexw9yY8DhCWJL0IdB5l8xkFA7uY",
  authDomain: "vtc-test-app.firebaseapp.com",
  projectId: "vtc-test-app",
  storageBucket: "vtc-test-app.appspot.com",
  messagingSenderId: "891557753767",
  appId: "1:891557753767:web:237e900a653a811fe53c82"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();

// STUN servers
const servers = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
      ]
    }
  ],
  iceCandidatePoolSize: 10,
}

// global state
let pc = new RTCPeerConnection(servers);
let localStream = null; // your webcam
let remoteStream = null; // your friend's webcam

const webcamBtn = document.getElementById('webcamBtn'),
webcamVideo = document.getElementById('webcamVideo'),
callBtn = document.getElementById('callBtn'),
callInput = document.getElementById('callInput'),
answerBtn = document.getElementById('answerBtn'),
remoteVideo = document.getElementById('remoteVideo'),
hangupBtn = document.getElementById('hangupBtn');  // i'll try to implement hangup functionality as well
listenYsBtn = document.getElementById('listenYsBtn');
toggleMic = document.getElementById('toggleMic');

// setting up media sources
webcamBtn.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // push tracks from local stream to peer connection
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;
};

// Create an offer
callBtn.onclick = async () => {
  // reference Firestore collection
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // get candidates for caller, save it to the database
  pc.onicecandidate = event => event.candidate && offerCandidates.add(event.candidate.toJSON());

  // create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type
  };

  await callDoc.set({offer});

  // listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    };
  });

  // when answered, add candidate to peer connection
  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      };
    });
  });
};

// answer the call with unique id
answerBtn.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = event => event.candidate && answerCandidates.add(event.candidate.toJSON());

  const callData = (await callDoc.get()).data();
  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp
  };

  await callDoc.update({answer});

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      };
    });
  });
};

// toggle your audio button (stop listening yourself on the browser)
listenYsBtn.onclick = () => {
  webcamVideo.muted = !webcamVideo.muted
};

// toggle mute your audio [haven't tested it lol]
toggleMic.onclick = () => {
  if (webcamVideo.volume === 1) webcamVideo.volume = 0;
  else webcamVideo.volume = 1;
}
