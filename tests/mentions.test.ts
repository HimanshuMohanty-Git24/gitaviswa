// The writer's own feeling vs. a denial vs. a topic. Cases come from the audit's T04 evaluation table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMention, combineMentions } from "../src/lib/graphrag/mentions.ts";
import { fold } from "../src/lib/graphrag/text.ts";

const kind = (text: string, cue: string) => classifyMention(fold(text), fold(cue));

test("a feeling the writer states is expressed", () => {
  assert.equal(kind("I feel worried about tomorrow.", "worried"), "expressed");
  assert.equal(kind("I'm grateful for the walk we took today.", "grateful"), "expressed");
  assert.equal(kind("I keep replaying an argument and can't let the anger go.", "anger"), "mentioned");
  assert.equal(kind("Feeling anxious before the interview.", "anxious"), "expressed");
  assert.equal(kind("I'm so tired of pretending.", "tired"), "expressed", "one intensifier may sit between frame and word");
});

test("when unsure, a word is treated as mentioned rather than felt", () => {
  assert.equal(kind("I can't stand my anger any more.", "anger"), "mentioned", "possessives are not read as feelings");
  assert.equal(kind('My friend said "I feel hopeless" and I did not know what to say.', "friend"), "mentioned", "a lexicon noun is not a feeling");
  assert.equal(kind("I am a friend to everyone at work.", "friend"), "mentioned");
});

test("a denied feeling is not attributed to the writer", () => {
  assert.equal(kind("I am not angry; I am curious about anger in the text.", "angry"), "negated");
  assert.equal(kind("I don't feel anxious, but the exam is tomorrow.", "anxious"), "negated");
  assert.equal(kind("Mujhe gussa nahi aata.", "gussa"), "negated");
});

test("curiosity about a feeling is a topic, not a disclosure", () => {
  assert.equal(kind("I am not angry; I am curious about anger in the text.", "anger"), "mentioned");
  assert.equal(combineMentions([kind("I am not angry; I am curious about anger in the text.", "angry"), kind("I am not angry; I am curious about anger in the text.", "anger")]), "mentioned");
  assert.equal(kind("I wonder what anger is, according to the Gita.", "anger"), "mentioned");
  assert.equal(kind("Explain the concept of fear in chapter 2.", "fear"), "mentioned");
});

test("someone else's feeling, or a quotation, belongs to its subject", () => {
  assert.equal(kind('My friend said "I feel hopeless" and I did not know what to say.', "hopeless"), "mentioned");
  assert.equal(kind("Arjuna is overwhelmed by grief on the battlefield.", "grief"), "mentioned");
  assert.equal(kind("When you feel anxious, what does the Gita suggest?", "anxious"), "mentioned");
  assert.equal(kind("My friend is angry with me.", "angry"), "mentioned");
});

test("Hinglish first-person frames are recognised", () => {
  assert.equal(kind("Mujhe bahut gussa aata hai jab log late aate hain.", "gussa"), "expressed");
});

test("absent cues return null; combining keeps the strongest evidence", () => {
  assert.equal(kind("Could a city be designed around cooperation rather than competition?", "anger"), null);
  assert.equal(combineMentions([null, "negated", "negated"]), "negated");
  assert.equal(combineMentions(["mentioned", "expressed"]), "expressed");
  assert.equal(combineMentions([null]), null);
});
