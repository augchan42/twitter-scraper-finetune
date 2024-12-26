import { GoogleGenerativeAI } from "@google/generative-ai";

const SUMMARIZATION_PROMPT =
  "Summarize these tweets of a person into several sentences like events report. This data must be used as knowledge of a agent. Present them as your own knowledge. Must keep all the numbers and the private names. Omit the exclamations and short comments. Separate into paragraphs if it's necessary, each paragraph must include full of content, don't let the connections between paragraphs. Do not include the prompt in the response. Do not mention the author of the tweets in response. Translate response to English.  After that, put the result into an array string, each element is a paragraph. This part is `knowledge`. Generate the `bio`, `lore`, `topics`, `adjectives` and `style` of knowledge to an agent using above tweets data. `topics` and `style` data are short sentences. `bio`, `lore`, `topics`, `adjectives` are the arrays of string, each element must be a sentence. `style` includes `all` (array of strings), `chat` (array of strings) and `post` (array of strings). Must return result as JSON format. No need put response in a code block.";

class KnowledgeGenerator {
  constructor() {
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY
    );
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
    });
    this.knowledge = [];
    this.topics = [];
    this.adjectives = [];
    this.style = {
      all: [],
      chat: [],
      post: [],
    };
    this.bio = [];
    this.lore = [];
  }

  async addKnowledge(data) {
    let knowledgeData = "";
    let beginIdx = 0;
    let endIdx = 0;
    // The data should be an array of strings, we need to convert it to a string with a comma between each string element
    // and the length of the array should be less than 10000
    for (let i = 0; i < data.length; i++) {
      if (knowledgeData.length == 0) {
        beginIdx = i;
        knowledgeData = '"' + data[i] + '"';
      } else {
        knowledgeData = knowledgeData + ', "' + data[i] + '"';
      }

      if (
        i == data.length - 1 ||
        knowledgeData.length + data[i + 1].length > 10000
      ) {
        endIdx = i;
        console.log(
          "Summarizing group data [",
          beginIdx,
          ", ",
          endIdx,
          "]/" + data.length + " with length",
          knowledgeData.length + "..."
        );
        try {
          const result = await this.model.generateContent([
            SUMMARIZATION_PROMPT,
            knowledgeData,
          ]);

          let rs = result.response.text();

          console.log("Response: ", rs);

          // convert the response to JSON format and fill the knowledge data
          let response = JSON.parse(rs);
          try {
            this.knowledge = this.knowledge.push(response.knowledge);
            this.bio = this.bio.push(response.bio);
            this.lore = this.lore.push(response.lore);
            this.topics = this.topics.push(response.topics);
            this.adjectives = this.adjectives.push(response.adjectives);
            this.style.all = this.style.all.push(response.style.all);
            this.style.chat = this.style.chat.push(response.style.chat);
            this.style.post = this.style.post.push(response.style.post);
          } catch (error) {
            console.error(`Error adding knowledge data: ${error.message}`);
          }
          break;
        } catch (error) {
          console.error(`Error summarizing data: ${error.message}`);
        }
        knowledgeData = "";
      }
    }
  }

  // async addExternalKnowledge(data) {}

  getKnowledge() {
    return this.knowledge;
  }

  getBio() {
    return this.bio;
  }

  getLore() {
    return this.lore;
  }

  getTopics() {
    return this.topics;
  }

  getAdjectives() {
    return this.adjectives;
  }

  getStyle() {
    return this.style;
  }
}

export { KnowledgeGenerator };
