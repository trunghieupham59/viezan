# TweetNaCl

Unmodified `tweetnacl.c` and `tweetnacl.h`, version 20140427, from
<https://tweetnacl.cr.yp.to/software.html>. Public domain (Bernstein, van
Gastel, Janssen, Lange, Schwabe, Smetsers).

Viezan uses only `crypto_sign_open` to verify the Ed25519 signature of an
update manifest (`NativeUpdates.cpp`). Do not edit these files; replace them
as a pair and update the checksums.

```
02e65bc3013ff2168983365e55906bc783c4c7e0a60d8100f17bb303a17175c4  tweetnacl.c
43f29ad721d9927b747b0100ab4160c119e7bb180c7c98a66e4bf79d31244287  tweetnacl.h
```
