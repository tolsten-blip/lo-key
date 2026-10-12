import pytest

from lokey.youtube import YouTubeError, parse_video_id

ID = "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={ID}",
        f"https://youtube.com/watch?v={ID}&t=42s",
        f"https://m.youtube.com/watch?feature=share&v={ID}",
        f"https://music.youtube.com/watch?v={ID}&list=RDAMVM",
        f"https://youtu.be/{ID}",
        f"https://youtu.be/{ID}?si=abc123",
        f"https://www.youtube.com/shorts/{ID}",
        f"https://www.youtube.com/embed/{ID}",
        f"youtube.com/watch?v={ID}",
        f"  https://youtu.be/{ID}  ",
    ],
)
def test_parses_common_link_formats(url):
    assert parse_video_id(url) == ID


@pytest.mark.parametrize(
    "url",
    [
        "",
        "https://vimeo.com/123456",
        "https://www.youtube.com/",
        "https://www.youtube.com/watch?v=short",
        "https://www.youtube.com/@somechannel",
        "https://evil.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    ],
)
def test_rejects_bad_links(url):
    with pytest.raises(YouTubeError):
        parse_video_id(url)
