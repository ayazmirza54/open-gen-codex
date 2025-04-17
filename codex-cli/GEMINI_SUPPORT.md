# Using Gemini Models with Codex CLI

Codex CLI now supports Google's Gemini models alongside OpenAI models. This allows you to choose which AI provider and model to use for your coding assistant.

## Setup

To use Gemini models, you'll need to:

1. Obtain a Google API key from the [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Set the API key as an environment variable:

```shell
export GOOGLE_API_KEY="your-google-api-key-here"
```

## Available Gemini Models

The following Gemini models are supported:

- `gemini-1.5-pro` - Recommended for most coding tasks
- `gemini-1.5-flash` - Faster, but less capable
- `gemini-pro` - Legacy model (Gemini 1.0)

## Usage

Specify a Gemini model using the `--model` flag:

```shell
codex --model gemini-1.5-pro "Write a React component that shows a to-do list"
```

You can switch between OpenAI and Gemini models during an interactive session using the `/model` command.

## Configuration

You can set default models in your config:

```shell
codex --model gemini-1.5-pro
```

This will update your `~/.codex/config.json` file to use Gemini by default.

## Troubleshooting

If you encounter issues with Gemini models:

1. Ensure your `GOOGLE_API_KEY` environment variable is set correctly
2. Check that you're using a supported model name
3. Verify your API key has access to the model you're trying to use

For more help, please file an issue on the GitHub repository.
